import { PI, POOL_UNITS, REF_FPS, TAU, WORLD_SIZE } from '../constants.ts';
import { poolCounts, unit } from '../pools.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { invSqrtMass, unitType } from '../unit-types.ts';
import { AMP_RANGE_MULT } from './combat.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';

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

const SEPARATION_SCALE = 200;
const SEPARATION_WEIGHT = 3;
const ALIGNMENT_WEIGHT = 0.5;
const COHESION_WEIGHT = 0.01;

const COHESION_RANGE = 150;
const ALIGNMENT_RANGE = 120;

const GLOBAL_TARGET_PROB = 0.012;
const NEIGHBOR_RANGE = 200;

const VET_SPEED_BONUS = 0.12;
export const STUN_DRAG_BASE = 0.93;
const KB_DRAG_BASE = 0.88;
const KB_EPSILON = 0.01;
const RETREAT_SPEED_SCALE = 2.5;

export const BOUNDARY_MARGIN = 0.8;
const BOUNDARY_FORCE = 120;

const HEALER_FOLLOW_WEIGHT = 0.05;

const VET_TARGET_WEIGHT = 0.3;

function targetScore(ux: number, uy: number, o: Unit, massWeight: number): number {
  const d2 = (o.x - ux) * (o.x - ux) + (o.y - uy) * (o.y - uy);
  const vf = 1 + VET_TARGET_WEIGHT * o.vet;
  const mf = massWeight > 0 ? 1 + massWeight * unitType(o.type).mass : 1;
  return d2 / (vf * vf * mf * mf);
}

// targetScore(): vet差で見かけ距離を縮小し、massWeight>0で重い敵にバイアス
function findNearestLocalEnemy(u: Unit, nn: number, range: number, massWeight: number): UnitIndex {
  const limit = range * 3;
  let bs = limit * limit,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team === u.team || !o.alive) continue;
    const score = targetScore(u.x, u.y, o, massWeight);
    if (score < bs) {
      bs = score;
      bi = oi;
    }
  }
  return bi;
}

// findNearestLocalEnemy の全体スキャン版（スコアリングは同一）
function findNearestGlobalEnemy(u: Unit, massWeight: number): UnitIndex {
  let bs = 1e18,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const o = unit(i);
    if (!o.alive) continue;
    rem--;
    if (o.team === u.team) continue;
    const score = targetScore(u.x, u.y, o, massWeight);
    if (score < bs) {
      bs = score;
      bi = i as UnitIndex;
    }
  }
  return bi;
}

function findTarget(u: Unit, nn: number, range: number, dt: number, rng: () => number, massWeight: number): UnitIndex {
  if (u.target !== NO_UNIT && unit(u.target).alive) return u.target;

  const localTarget = findNearestLocalEnemy(u, nn, range, massWeight);
  if (localTarget !== NO_UNIT) return localTarget;

  if (rng() < 1 - (1 - GLOBAL_TARGET_PROB) ** (dt * REF_FPS)) {
    return findNearestGlobalEnemy(u, massWeight);
  }
  return NO_UNIT;
}

// Boids accumulator — computeBoidsForce がリセットし accumulateBoidsNeighbor が累積
const _boids = { sx: 0, sy: 0, ax: 0, ay: 0, ac: 0, chx: 0, chy: 0, cc: 0 };

function accumulateBoidsNeighbor(u: Unit, o: Unit, sd: number, uMass: number) {
  const dx = u.x - o.x,
    dy = u.y - o.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return;
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

function computeBoidsForce(u: Unit, nn: number, t: UnitType): SteerForce {
  _boids.sx = 0;
  _boids.sy = 0;
  _boids.ax = 0;
  _boids.ay = 0;
  _boids.ac = 0;
  _boids.chx = 0;
  _boids.chy = 0;
  _boids.cc = 0;

  const sd = t.size * 4;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (!o.alive || o === u) continue;
    accumulateBoidsNeighbor(u, o, sd, t.mass);
  }

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
  return _boidsForce;
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
    const engageMax = t.engageMax ?? t.range * 0.7;
    const engageMin = t.engageMin ?? t.range * 0.3;
    if (d > engageMax) {
      _engageForce.x = (dx / d) * t.speed * 2;
      _engageForce.y = (dy / d) * t.speed * 2;
      return _engageForce;
    }
    if (d < engageMin) {
      _engageForce.x = -(dx / d) * t.speed;
      _engageForce.y = (dy / d) * t.speed * 0.5;
      return _engageForce;
    }
    _engageForce.x = (-dy / d) * t.speed * 0.8;
    _engageForce.y = (dx / d) * t.speed * 0.8;
    return _engageForce;
  }
  u.wanderAngle += (rng() - 0.5) * 2 * dt;
  _engageForce.x = Math.cos(u.wanderAngle) * t.speed * 0.5;
  _engageForce.y = Math.sin(u.wanderAngle) * t.speed * 0.5;
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
    if (o.team === u.team || !o.alive) continue;
    const dx = u.x - o.x,
      dy = u.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) continue;
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

function computeHealerFollow(u: Unit, nn: number): SteerForce {
  let bm = 0,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team !== u.team || !o.alive || o === u) continue;
    if (unitType(o.type).mass > bm) {
      bm = unitType(o.type).mass;
      bi = oi;
    }
  }
  if (bi !== NO_UNIT) {
    const o = unit(bi);
    _healForce.x = (o.x - u.x) * HEALER_FOLLOW_WEIGHT;
    _healForce.y = (o.y - u.y) * HEALER_FOLLOW_WEIGHT;
    return _healForce;
  }
  _healForce.x = 0;
  _healForce.y = 0;
  return _healForce;
}

// 再利用ブースト速度バッファ — handleBoost が上書きして返却する
const _boostVel = { vx: 0, vy: 0 };

function handleBoost(
  u: Unit,
  boost: NonNullable<UnitType['boost']>,
  tgt: number,
  spd: number,
  dt: number,
): typeof _boostVel | null {
  if (u.boostTimer > 0) {
    u.boostTimer -= dt;
    if (u.boostTimer <= 0) {
      u.boostTimer = 0;
      u.boostCooldown = boost.cooldown;
    } else {
      const bv = spd * boost.multiplier;
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
    if (d <= boost.triggerRange) {
      u.boostTimer = boost.duration;
      const bv = spd * boost.multiplier;
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
  if (Math.abs(u.kbVx) < KB_EPSILON) u.kbVx = 0;
  if (Math.abs(u.kbVy) < KB_EPSILON) u.kbVy = 0;
}

function tickBoostDuringStun(u: Unit, dt: number) {
  if (u.boostTimer <= 0 && u.boostCooldown <= 0) return;
  const bt = unitType(u.type).boost;
  if (!bt) return;
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
  const spd = t.speed * (1 + u.vet * VET_SPEED_BONUS);
  const boostVel = t.boost ? handleBoost(u, t.boost, tgt, spd, dt) : null;
  const response = dt * t.accel;
  u.vx += (Math.cos(u.angle) * spd - u.vx) * response;
  u.vy += (Math.sin(u.angle) * spd - u.vy) * response;
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

export function steer(u: Unit, dt: number, rng: () => number) {
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

  const boids = computeBoidsForce(u, nn, t);
  let fx = boids.x,
    fy = boids.y;

  const ampRange = u.ampBoostTimer > 0 ? AMP_RANGE_MULT : 1;
  const tgt = findTarget(u, nn, t.range * ampRange, dt, rng, t.massWeight ?? 0);
  u.target = tgt;

  const hpRatio = u.maxHp > 0 ? u.hp / u.maxHp : 0;
  const retreatUrgency =
    t.retreatHpRatio !== undefined && hpRatio < t.retreatHpRatio ? 1 - hpRatio / t.retreatHpRatio : 0;

  const engage = computeEngagementForce(u, tgt, t, dt, rng);
  // urgency=1で完全退避、0で通常エンゲージ
  const engageAtten = 1 - retreatUrgency;
  fx += engage.x * engageAtten;
  fy += engage.y * engageAtten;

  const retreat = computeRetreatForce(u, nn, t, hpRatio);
  fx += retreat.x;
  fy += retreat.y;

  if (t.heals || t.amplifies) {
    const heal = computeHealerFollow(u, nn);
    fx += heal.x;
    fy += heal.y;
  }

  const m = WORLD_SIZE * BOUNDARY_MARGIN;
  if (u.x < -m) fx += BOUNDARY_FORCE;
  if (u.x > m) fx -= BOUNDARY_FORCE;
  if (u.y < -m) fy += BOUNDARY_FORCE;
  if (u.y > m) fy -= BOUNDARY_FORCE;

  const da = Math.atan2(fy, fx);
  let ad = da - u.angle;
  if (ad > PI) ad -= TAU;
  if (ad < -PI) ad += TAU;
  u.angle += ad * t.turnRate * dt;

  applyVelocity(u, t, tgt, dt);
}
