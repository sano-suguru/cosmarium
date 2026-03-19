import { normalizeAngleDelta } from '../angle.ts';
import { NEIGHBOR_RANGE, REF_FPS, WORLD_SIZE } from '../constants.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { invSqrtMass, unitType } from '../unit-type-accessors.ts';
import type { SteerForce } from './boids.ts';
import { computeBoidsAndFindLocal, computeBoidsForce } from './boids.ts';
import type { NeighborSlice } from './spatial-hash.ts';
import { getNeighbors } from './spatial-hash.ts';
import { computeSquadronCohesion, computeSquadronLeaderObjective, computeSquadronLeashFactor } from './squadron.ts';
import { CATALYST_SPEED_MULT, CATALYST_TURN_MULT, tickBoost, tickBoostDuringStun } from './steering-boost.ts';
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

const _boundaryForce: SteerForce = { x: 0, y: 0 };

const GLOBAL_TARGET_PROB = 0.012;

const VET_SPEED_BONUS = 0.12;

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
  nb: NeighborSlice,
  t: UnitType,
  aggroRange: number,
  massWeight: number,
  dt: number,
  rng: () => number,
): ResolveResult {
  if (u.target !== NO_UNIT && unit(u.target).alive) {
    const boids = computeBoidsForce(u, nb, t);
    _resolveResult.target = u.target;
    _resolveResult.fx = boids.x;
    _resolveResult.fy = boids.y;
    return _resolveResult;
  }
  const local = computeBoidsAndFindLocal(u, nb, t, aggroRange, massWeight);
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

function computeBoundaryForce(x: number, y: number): SteerForce {
  const m = WORLD_SIZE * BOUNDARY_MARGIN;
  let bx = 0;
  let by = 0;
  if (x < -m) {
    bx += BOUNDARY_FORCE;
  }
  if (x > m) {
    bx -= BOUNDARY_FORCE;
  }
  if (y < -m) {
    by += BOUNDARY_FORCE;
  }
  if (y > m) {
    by -= BOUNDARY_FORCE;
  }
  _boundaryForce.x = bx;
  _boundaryForce.y = by;
  return _boundaryForce;
}

export function steer(u: Unit, ui: UnitIndex, dt: number, rng: () => number) {
  const nb = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
  steerWithNeighbors(u, ui, nb, dt, rng);
}

export function steerWithNeighbors(u: Unit, ui: UnitIndex, nb: NeighborSlice, dt: number, rng: () => number) {
  if (u.blinkPhase === 1) {
    applyKnockbackDrag(u, dt);
    return;
  }
  if (u.stun > 0) {
    steerStunned(u, dt);
    return;
  }
  const t = unitType(u.type);
  const aggroRange = t.aggroRange;
  const massWeight = t.massWeight;

  const res = resolveTarget(u, nb, t, aggroRange, massWeight, dt, rng);
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

  const retreat = computeRetreatForce(u, nb, t, hpRatio);
  fx += retreat.x;
  fy += retreat.y;

  if (isSupportType(t)) {
    const follow = t.heals ? computeHealerFollow(u, nb, t) : computeAllyCentroidFollow(u, nb, t);
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

  const boundary = computeBoundaryForce(u.x, u.y);
  fx += boundary.x;
  fy += boundary.y;

  const ad = normalizeAngleDelta(Math.atan2(fy, fx), u.angle);
  const catTurn = u.catalystTimer > 0 ? CATALYST_TURN_MULT : 1;
  u.angle += ad * t.turnRate * catTurn * dt;

  applyVelocity(u, t, res.target, dt);
}
