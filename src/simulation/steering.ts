import { PI, REF_FPS, TAU, WORLD_SIZE } from '../constants.ts';
import { getUnitHWM, poolCounts, unit } from '../pools.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { invSqrtMass, unitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { computeSquadCohesion, computeSquadLeaderObjective, computeSquadLeashFactor } from './squad.ts';
import { nearestEnemyCenter } from './team-center.ts';

interface SteerForce {
  x: number;
  y: number;
}

// 再利用ベクトル — 各 compute 関数が専用スロットに上書きして返却する
// 関数ごとに独立しているため呼び出し順序の制約はない
const _boidsForce: SteerForce = { x: 0, y: 0 };
const _engageForce: SteerForce = { x: 0, y: 0 };
const _retreatForce: SteerForce = { x: 0, y: 0 };
const _healForce: SteerForce = { x: 0, y: 0 };
const _squadCohesionOut: SteerForce = { x: 0, y: 0 };
const _squadObjOut: SteerForce = { x: 0, y: 0 };

interface ResolveResult {
  readonly target: UnitIndex;
  readonly fx: number;
  readonly fy: number;
}
const _resolveResult = { target: NO_UNIT as UnitIndex, fx: 0, fy: 0 };

const SEPARATION_SCALE = 400;
const SEPARATION_WEIGHT = 3;
const ALIGNMENT_WEIGHT = 0.5;
const COHESION_WEIGHT = 0.01;

const COHESION_RANGE = 150;
const ALIGNMENT_RANGE = 120;

/** seek 重みが SEEK_MAX_WEIGHT に飽和する距離 */
const SEEK_FULL_WEIGHT_DIST = WORLD_SIZE / 12;
/** seek 重みの上限 */
const SEEK_MAX_WEIGHT = 1.0;
/** wander 重み（seek : wander = SEEK_MAX_WEIGHT : WANDER_WEIGHT で比率が決まる） */
const WANDER_WEIGHT = 0.25;
/** seek 処理をスキップする距離²の下限（重心に十分近い場合ゼロ除算回避兼 seek 不要） */
const SEEK_MIN_DIST_SQ = 1;
/** ターゲットなし時の純粋ワンダー速度倍率 */
const WANDER_ONLY_SCALE = 0.5;

const GLOBAL_TARGET_PROB = 0.012;
const NEIGHBOR_RANGE = 200;

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
const RETREAT_SPEED_SCALE = 2.5;

export const BOUNDARY_MARGIN = 0.8;
const BOUNDARY_FORCE = 120;

const HEALER_FOLLOW_WEIGHT = 0.15;
const MASS_TIEBREAK_FACTOR = 0.01;

const VET_TARGET_WEIGHT = 0.3;

function targetScore(ux: number, uy: number, o: Unit, massWeight: number): number {
  const d2 = (o.x - ux) * (o.x - ux) + (o.y - uy) * (o.y - uy);
  const vf = 1 + VET_TARGET_WEIGHT * o.vet;
  const mf = massWeight > 0 ? 1 + massWeight * unitType(o.type).mass : 1;
  return d2 / (vf * vf * mf * mf);
}

function findNearestGlobalEnemy(u: Unit, massWeight: number): UnitIndex {
  let bs = 1e18,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const o = unit(i);
    if (!o.alive) {
      continue;
    }
    rem--;
    if (o.team === u.team) {
      continue;
    }
    const score = targetScore(u.x, u.y, o, massWeight);
    if (score < bs) {
      bs = score;
      bi = i as UnitIndex;
    }
  }
  return bi;
}

// Boids accumulator — computeBoidsForce がリセットし accumulateBoidsNeighbor が累積
const _boids = { sx: 0, sy: 0, ax: 0, ay: 0, ac: 0, chx: 0, chy: 0, cc: 0 };

function accumulateBoidsNeighbor(u: Unit, o: Unit, sd: number, uMass: number) {
  const dx = u.x - o.x,
    dy = u.y - o.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) {
    return;
  }
  const d = Math.sqrt(d2);

  if (d < sd) {
    const massScale = Math.sqrt(unitType(o.type).mass / uMass);
    _boids.sx += (dx / d / d2) * SEPARATION_SCALE * massScale;
    _boids.sy += (dy / d / d2) * SEPARATION_SCALE * massScale;
  }
  if (o.team === u.team) {
    if (d < COHESION_RANGE) {
      _boids.chx += o.x;
      _boids.chy += o.y;
      _boids.cc++;
    }
    if (o.type === u.type && d < ALIGNMENT_RANGE) {
      _boids.ax += o.vx;
      _boids.ay += o.vy;
      _boids.ac++;
    }
  }
}

function finalizeBoids(u: Unit) {
  let fx = _boids.sx * SEPARATION_WEIGHT,
    fy = _boids.sy * SEPARATION_WEIGHT;
  if (_boids.ac > 0) {
    fx += (_boids.ax / _boids.ac - u.vx) * ALIGNMENT_WEIGHT;
    fy += (_boids.ay / _boids.ac - u.vy) * ALIGNMENT_WEIGHT;
  }
  if (_boids.cc > 0) {
    fx += (_boids.chx / _boids.cc - u.x) * COHESION_WEIGHT;
    fy += (_boids.chy / _boids.cc - u.y) * COHESION_WEIGHT;
  }
  _boidsForce.x = fx;
  _boidsForce.y = fy;
}

function computeBoidsForce(u: Unit, nn: number, t: UnitType): SteerForce {
  _boids.sx = 0;
  _boids.sy = 0;
  _boids.ax = 0;
  _boids.ay = 0;
  _boids.ac = 0;
  _boids.chx = 0;
  _boids.chy = 0;
  _boids.cc = 0;

  const sd = t.size * 6;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (!o.alive || o === u) {
      continue;
    }
    accumulateBoidsNeighbor(u, o, sd, t.mass);
  }

  finalizeBoids(u);
  return _boidsForce;
}

/** boids 計算と最近接敵探索を1パスで行う。見つかった敵の UnitIndex を返す */
function computeBoidsAndFindLocal(u: Unit, nn: number, t: UnitType, range: number, massWeight: number): UnitIndex {
  _boids.sx = 0;
  _boids.sy = 0;
  _boids.ax = 0;
  _boids.ay = 0;
  _boids.ac = 0;
  _boids.chx = 0;
  _boids.chy = 0;
  _boids.cc = 0;

  const sd = t.size * 6;
  const limit = range * 3;
  let bs = limit * limit;
  let bi: UnitIndex = NO_UNIT;

  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (!o.alive || o === u) {
      continue;
    }

    accumulateBoidsNeighbor(u, o, sd, t.mass);

    if (o.team !== u.team) {
      const score = targetScore(u.x, u.y, o, massWeight);
      if (score < bs) {
        bs = score;
        bi = oi;
      }
    }
  }

  finalizeBoids(u);
  return bi;
}

function computeEngagementForce(u: Unit, tgt: UnitIndex, t: UnitType, dt: number, rng: () => number): SteerForce {
  if (tgt !== NO_UNIT) {
    const o = unit(tgt);
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (t.rams) {
      _engageForce.x = (dx / d) * t.speed * 3;
      _engageForce.y = (dy / d) * t.speed * 3;
      return _engageForce;
    }
    const engageMax = t.engageMax;
    const engageMin = t.engageMin;
    if (d > engageMax) {
      _engageForce.x = (dx / d) * t.speed * 2;
      _engageForce.y = (dy / d) * t.speed * 2;
      return _engageForce;
    }
    if (d < engageMin) {
      const urgency = 1 - d / engageMin;
      const mult = 1 + urgency;
      _engageForce.x = -(dx / d) * t.speed * mult;
      _engageForce.y = -(dy / d) * t.speed * mult;
      return _engageForce;
    }
    _engageForce.x = (-dy / d) * t.speed * 0.8;
    _engageForce.y = (dx / d) * t.speed * 0.8;
    return _engageForce;
  }
  u.wanderAngle += (rng() - 0.5) * 2 * dt;
  const ec = nearestEnemyCenter(u.team, u.x, u.y);
  if (ec) {
    const dx = ec.x - u.x;
    const dy = ec.y - u.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > SEEK_MIN_DIST_SQ) {
      const dist = Math.sqrt(d2);
      const seekW = Math.min(dist / SEEK_FULL_WEIGHT_DIST, SEEK_MAX_WEIGHT);
      const sx = (dx / dist) * seekW;
      const sy = (dy / dist) * seekW;
      const wx = Math.cos(u.wanderAngle) * WANDER_WEIGHT;
      const wy = Math.sin(u.wanderAngle) * WANDER_WEIGHT;
      const fx = sx + wx;
      const fy = sy + wy;
      const fLen = Math.sqrt(fx * fx + fy * fy) || 1;
      _engageForce.x = (fx / fLen) * t.speed;
      _engageForce.y = (fy / fLen) * t.speed;
      return _engageForce;
    }
  }
  _engageForce.x = Math.cos(u.wanderAngle) * t.speed * WANDER_ONLY_SCALE;
  _engageForce.y = Math.sin(u.wanderAngle) * t.speed * WANDER_ONLY_SCALE;
  return _engageForce;
}

function computeRetreatForce(u: Unit, nn: number, t: UnitType, hpRatio: number): SteerForce {
  if (t.retreatHpRatio === undefined || hpRatio >= t.retreatHpRatio) {
    _retreatForce.x = 0;
    _retreatForce.y = 0;
    return _retreatForce;
  }
  const urgency = 1 - hpRatio / t.retreatHpRatio;
  let rx = 0,
    ry = 0;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team === u.team || !o.alive) {
      continue;
    }
    const dx = u.x - o.x,
      dy = u.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) {
      continue;
    }
    const f = t.range / d;
    rx += (dx / d) * f;
    ry += (dy / d) * f;
  }
  // sigmoidスケーリング: 近距離・多敵で飽和、遠距離・少敵で減衰する滑らかな曲線
  const mag = Math.sqrt(rx * rx + ry * ry);
  if (mag > 0) {
    const s = mag / (1 + mag);
    rx = (rx / mag) * s;
    ry = (ry / mag) * s;
  }
  const scale = urgency * t.speed * RETREAT_SPEED_SCALE;
  _retreatForce.x = rx * scale;
  _retreatForce.y = ry * scale;
  return _retreatForce;
}

function computeHealerFollow(u: Unit, nn: number, t: UnitType): SteerForce {
  // bs = -1: score は常に正なので最初の候補が必ず選ばれる
  let bs = -1,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team !== u.team || !o.alive || o === u) {
      continue;
    }
    const hpRatio = o.hp / o.maxHp;
    const score = 1 - hpRatio + unitType(o.type).mass * MASS_TIEBREAK_FACTOR;
    if (score > bs) {
      bs = score;
      bi = oi;
    }
  }
  if (bi !== NO_UNIT) {
    const o = unit(bi);
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    _healForce.x = (dx / d) * t.speed;
    _healForce.y = (dy / d) * t.speed;
    return _healForce;
  }
  _healForce.x = 0;
  _healForce.y = 0;
  return _healForce;
}

// 再利用ブースト速度バッファ — tickBoost が上書きして返却する
const _boostVel = { vx: 0, vy: 0 };

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

/** boids 計算 + ターゲット解決を一括で行う。_boidsForce に boids 力を書き込み、ターゲットを返す */
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
    computeBoidsForce(u, nn, t);
    _resolveResult.target = u.target;
    _resolveResult.fx = _boidsForce.x;
    _resolveResult.fy = _boidsForce.y;
    return _resolveResult;
  }
  const localTarget = computeBoidsAndFindLocal(u, nn, t, range, massWeight);
  if (localTarget !== NO_UNIT) {
    _resolveResult.target = localTarget;
    _resolveResult.fx = _boidsForce.x;
    _resolveResult.fy = _boidsForce.y;
    return _resolveResult;
  }
  _resolveResult.fx = _boidsForce.x;
  _resolveResult.fy = _boidsForce.y;
  if (rng() < 1 - (1 - GLOBAL_TARGET_PROB) ** (dt * REF_FPS)) {
    _resolveResult.target = findNearestGlobalEnemy(u, massWeight);
    return _resolveResult;
  }
  _resolveResult.target = NO_UNIT;
  return _resolveResult;
}

export function steer(u: Unit, ui: UnitIndex, dt: number, rng: () => number) {
  if (u.blinkPhase === 1) {
    applyKnockbackDrag(u, dt);
    return;
  }
  if (u.stun > 0) {
    steerStunned(u, dt);
    return;
  }
  const t = unitType(u.type);
  const nn = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
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
  const leashFactor = computeSquadLeashFactor(u, ui);
  const engageAtten = (1 - retreatUrgency) * supportScale * leashFactor;
  fx += engage.x * engageAtten;
  fy += engage.y * engageAtten;

  const retreat = computeRetreatForce(u, nn, t, hpRatio);
  fx += retreat.x;
  fy += retreat.y;

  if (isSupportType(t)) {
    const heal = computeHealerFollow(u, nn, t);
    const followWeight = HEALER_FOLLOW_WEIGHT * t.supportFollow;
    fx += heal.x * followWeight;
    fy += heal.y * followWeight;
  }

  computeSquadCohesion(u, ui, _squadCohesionOut);
  fx += _squadCohesionOut.x;
  fy += _squadCohesionOut.y;

  computeSquadLeaderObjective(u, ui, res.target !== NO_UNIT, t.speed, _squadObjOut);
  fx += _squadObjOut.x;
  fy += _squadObjOut.y;

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
