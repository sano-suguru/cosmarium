import { NEIGHBOR_RANGE, PI, REF_FPS, TAU, WORLD_SIZE } from '../constants.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { invSqrtMass, unitType } from '../unit-type-accessors.ts';
import type { SteerForce } from './boids.ts';
import { computeBoidsAndFindLocal, computeBoidsForce } from './boids.ts';
import { getNeighbors } from './spatial-hash.ts';
import { computeSquadronCohesion, computeSquadronLeaderObjective, computeSquadronLeashFactor } from './squadron.ts';
import {
  computeAllyCentroidFollow,
  computeEngagementForce,
  computeHealerFollow,
  computeRetreatForce,
  SUPPORT_FOLLOW_WEIGHT,
} from './steering-forces.ts';
import { findNearestGlobalEnemy } from './target-search.ts';

interface ResolveResult {
  readonly target: UnitIndex;
  readonly fx: number;
  readonly fy: number;
}
const _resolveResult: { target: UnitIndex; fx: number; fy: number } = { target: NO_UNIT, fx: 0, fy: 0 };

const _squadronCohesionOut: SteerForce = { x: 0, y: 0 };
const _squadronObjOut: SteerForce = { x: 0, y: 0 };

// 再利用ブースト速度バッファ — tickBoost が上書きして返却する
const _boostVel = { vx: 0, vy: 0 };

const GLOBAL_TARGET_PROB = 0.012;

const VET_SPEED_BONUS = 0.12;
export const CATALYST_SPEED_MULT = 1.25;
export const CATALYST_TURN_MULT = 1.3;
export const CATALYST_BOOST_MULT = 1.3;
export const CATALYST_BOOST_DUR_MULT = 1.3;
export const CATALYST_BOOST_CD_MULT = 0.75;
export const CATALYST_BOOST_RANGE_MULT = 1.3;
export const STUN_DRAG_BASE = 0.93;
const KB_DRAG_BASE = 0.88;
const KB_EPSILON = 0.01;
export const BOUNDARY_MARGIN = 0.8;
const BOUNDARY_FORCE = 120;
export const AMP_RANGE_MULT = 1.25;
export const SCRAMBLE_RANGE_MULT = 0.75;

export function computeEffectiveRange(u: Unit, baseRange: number): number {
  const ampRange = u.ampBoostTimer > 0 ? AMP_RANGE_MULT : 1;
  const scrRange = u.scrambleTimer > 0 ? SCRAMBLE_RANGE_MULT : 1;
  return baseRange * ampRange * scrRange;
}

function isSupportType(t: UnitType): boolean {
  return t.supportFollow > 0;
}

function tickBoost(
  u: Unit,
  boost: NonNullable<UnitType['boost']>,
  tgt: number,
  spd: number,
  dt: number,
  catalyzed: boolean,
): typeof _boostVel | null {
  const mult = catalyzed ? boost.multiplier * CATALYST_BOOST_MULT : boost.multiplier;
  const dur = catalyzed ? boost.duration * CATALYST_BOOST_DUR_MULT : boost.duration;
  const cd = catalyzed ? boost.cooldown * CATALYST_BOOST_CD_MULT : boost.cooldown;
  const range = catalyzed ? boost.triggerRange * CATALYST_BOOST_RANGE_MULT : boost.triggerRange;

  if (u.boostTimer > 0) {
    u.boostTimer -= dt;
    if (u.boostTimer <= 0) {
      u.boostTimer = 0;
      u.boostCooldown = cd;
    } else {
      const bv = spd * mult;
      _boostVel.vx = Math.cos(u.angle) * bv;
      _boostVel.vy = Math.sin(u.angle) * bv;
      return _boostVel;
    }
  } else if (u.boostCooldown > 0) {
    u.boostCooldown = Math.max(0, u.boostCooldown - dt);
  }

  if (u.boostTimer <= 0 && u.boostCooldown <= 0 && tgt !== NO_UNIT) {
    const o = unit(tgt);
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= range) {
      u.boostTimer = dur;
      const bv = spd * mult;
      const nd = d || 1;
      _boostVel.vx = (dx / nd) * bv;
      _boostVel.vy = (dy / nd) * bv;
      return _boostVel;
    }
  }
  return null;
}

function applyKnockbackDrag(u: Unit, dt: number) {
  const kbDrag = KB_DRAG_BASE ** (dt * REF_FPS);
  u.kbVx *= kbDrag;
  u.kbVy *= kbDrag;
  if (Math.abs(u.kbVx) < KB_EPSILON) {
    u.kbVx = 0;
  }
  if (Math.abs(u.kbVy) < KB_EPSILON) {
    u.kbVy = 0;
  }
}

function tickBoostDuringStun(u: Unit, dt: number) {
  if (u.boostTimer <= 0 && u.boostCooldown <= 0) {
    return;
  }
  const bt = unitType(u.type).boost;
  if (!bt) {
    return;
  }
  if (u.boostTimer > 0) {
    u.boostTimer = 0;
    u.boostCooldown = bt.cooldown;
  }
  if (u.boostCooldown > 0) {
    u.boostCooldown = Math.max(0, u.boostCooldown - dt);
  }
}

function steerStunned(u: Unit, dt: number) {
  u.stun -= dt;
  tickBoostDuringStun(u, dt);
  const stunDrag = (STUN_DRAG_BASE ** invSqrtMass(u.type)) ** (dt * REF_FPS);
  u.vx *= stunDrag;
  u.vy *= stunDrag;
  applyKnockbackDrag(u, dt);
  u.x += (u.vx + u.kbVx) * dt;
  u.y += (u.vy + u.kbVy) * dt;
}

function applyVelocity(u: Unit, t: UnitType, tgt: number, dt: number) {
  const catalyzed = u.catalystTimer > 0;
  const spd = t.speed * (1 + u.vet * VET_SPEED_BONUS) * (catalyzed ? CATALYST_SPEED_MULT : 1);
  const boostVel = t.boost ? tickBoost(u, t.boost, tgt, spd, dt, catalyzed) : null;
  const accelLerp = dt * t.accel;
  u.vx += (Math.cos(u.angle) * spd - u.vx) * accelLerp;
  u.vy += (Math.sin(u.angle) * spd - u.vy) * accelLerp;
  if (boostVel) {
    u.vx = boostVel.vx;
    u.vy = boostVel.vy;
  }
  const moveDrag = (1 - Math.min(1, t.drag / REF_FPS)) ** (dt * REF_FPS);
  u.vx *= moveDrag;
  u.vy *= moveDrag;
  applyKnockbackDrag(u, dt);
  u.x += (u.vx + u.kbVx) * dt;
  u.y += (u.vy + u.kbVy) * dt;
}

/** boids 計算 + ターゲット解決を一括で行う。boids 力とターゲットを返す */
function resolveTarget(
  u: Unit,
  nn: number,
  t: UnitType,
  range: number,
  massWeight: number,
  dt: number,
  rng: () => number,
): ResolveResult {
  if (u.target !== NO_UNIT && unit(u.target).alive) {
    const boids = computeBoidsForce(u, nn, t);
    _resolveResult.target = u.target;
    _resolveResult.fx = boids.x;
    _resolveResult.fy = boids.y;
    return _resolveResult;
  }
  const local = computeBoidsAndFindLocal(u, nn, t, range, massWeight);
  _resolveResult.fx = local.fx;
  _resolveResult.fy = local.fy;
  if (local.target !== NO_UNIT) {
    _resolveResult.target = local.target;
    return _resolveResult;
  }
  if (rng() < 1 - (1 - GLOBAL_TARGET_PROB) ** (dt * REF_FPS)) {
    _resolveResult.target = findNearestGlobalEnemy(u, massWeight);
    return _resolveResult;
  }
  _resolveResult.target = NO_UNIT;
  return _resolveResult;
}

export function steer(u: Unit, ui: UnitIndex, dt: number, rng: () => number) {
  const nn = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
  steerWithNeighbors(u, ui, nn, dt, rng);
}

export function steerWithNeighbors(u: Unit, ui: UnitIndex, nn: number, dt: number, rng: () => number) {
  if (u.blinkPhase === 1) {
    applyKnockbackDrag(u, dt);
    return;
  }
  if (u.stun > 0) {
    steerStunned(u, dt);
    return;
  }
  const t = unitType(u.type);
  const range = computeEffectiveRange(u, t.range);
  const massWeight = t.massWeight;

  const res = resolveTarget(u, nn, t, range, massWeight, dt, rng);
  u.target = res.target;

  let fx = res.fx,
    fy = res.fy;

  const hpRatio = u.maxHp > 0 ? u.hp / u.maxHp : 0;
  const retreatUrgency =
    t.retreatHpRatio !== undefined && hpRatio < t.retreatHpRatio ? 1 - hpRatio / t.retreatHpRatio : 0;

  const engage = computeEngagementForce(u, res.target, t, dt, rng);
  const supportScale = 1 - t.supportFollow * 0.6;
  const leashFactor = computeSquadronLeashFactor(u, ui);
  const engageAtten = (1 - retreatUrgency) * supportScale * leashFactor;
  fx += engage.x * engageAtten;
  fy += engage.y * engageAtten;

  const retreat = computeRetreatForce(u, nn, t, hpRatio);
  fx += retreat.x;
  fy += retreat.y;

  if (isSupportType(t)) {
    const follow = t.heals ? computeHealerFollow(u, nn, t) : computeAllyCentroidFollow(u, nn, t);
    const followWeight = SUPPORT_FOLLOW_WEIGHT * t.supportFollow;
    fx += follow.x * followWeight;
    fy += follow.y * followWeight;
  }

  computeSquadronCohesion(u, ui, _squadronCohesionOut);
  fx += _squadronCohesionOut.x;
  fy += _squadronCohesionOut.y;

  computeSquadronLeaderObjective(u, ui, res.target !== NO_UNIT, t.speed, _squadronObjOut);
  fx += _squadronObjOut.x;
  fy += _squadronObjOut.y;

  const m = WORLD_SIZE * BOUNDARY_MARGIN;
  if (u.x < -m) {
    fx += BOUNDARY_FORCE;
  }
  if (u.x > m) {
    fx -= BOUNDARY_FORCE;
  }
  if (u.y < -m) {
    fy += BOUNDARY_FORCE;
  }
  if (u.y > m) {
    fy -= BOUNDARY_FORCE;
  }

  const da = Math.atan2(fy, fx);
  let ad = da - u.angle;
  if (ad > PI) {
    ad -= TAU;
  }
  if (ad < -PI) {
    ad += TAU;
  }
  const catTurn = u.catalystTimer > 0 ? CATALYST_TURN_MULT : 1;
  u.angle += ad * t.turnRate * catTurn * dt;

  applyVelocity(u, t, res.target, dt);
}
