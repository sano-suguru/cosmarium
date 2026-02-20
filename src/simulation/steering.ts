import { PI, POOL_UNITS, REF_FPS, TAU, WORLD_SIZE } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';

interface SteerForce {
  x: number;
  y: number;
}

// 再利用ベクトル — 各 compute 関数が上書きして返却する
// 呼び出し側は返却後すぐに fx/fy に転写すること
const _force: SteerForce = { x: 0, y: 0 };

const VET_TARGET_WEIGHT = 0.3;

// findTarget ヘルパー: 近傍から最近接敵を検索（ベテランほど見かけ距離が短くなる）
function findNearestLocalEnemy(u: Unit, nn: number, range: number): UnitIndex {
  let bs = range * 3,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team === u.team || !o.alive) continue;
    const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
    const score = d / (1 + VET_TARGET_WEIGHT * o.vet);
    if (score < bs) {
      bs = score;
      bi = oi;
    }
  }
  return bi;
}

// findTarget ヘルパー: 全ユニットから最近接敵を検索（ベテランほど見かけ距離が短くなる）
function findNearestGlobalEnemy(u: Unit): UnitIndex {
  let bs = 1e18,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < POOL_UNITS; i++) {
    const o = unit(i);
    if (!o.alive || o.team === u.team) continue;
    const d2 = (o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y);
    const vf = 1 + VET_TARGET_WEIGHT * o.vet;
    const score = d2 / (vf * vf);
    if (score < bs) {
      bs = score;
      bi = i as UnitIndex;
    }
  }
  return bi;
}

function findTarget(u: Unit, nn: number, range: number, dt: number, rng: () => number): UnitIndex {
  if (u.target !== NO_UNIT && unit(u.target).alive) return u.target;

  const localTarget = findNearestLocalEnemy(u, nn, range);
  if (localTarget !== NO_UNIT) return localTarget;

  if (rng() < 1 - (1 - 0.012) ** (dt * REF_FPS)) {
    return findNearestGlobalEnemy(u);
  }
  return NO_UNIT;
}

// computeBoidsForce 専用 accumulator — computeBoidsForce がリセットし
// accumulateBoidsNeighbor が累積する。外部から直接呼ばないこと
const _boids = { sx: 0, sy: 0, ax: 0, ay: 0, ac: 0, chx: 0, chy: 0, cc: 0 };

// computeBoidsForce 内部ヘルパー: 近傍単体の Boids 力を _boids に集約
function accumulateBoidsNeighbor(u: Unit, o: Unit, sd: number, uMass: number) {
  const dx = u.x - o.x,
    dy = u.y - o.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return;
  const d = Math.sqrt(d2);

  if (d < sd) {
    const massScale = Math.sqrt(unitType(o.type).mass / uMass);
    _boids.sx += (dx / d / d2) * 200 * massScale;
    _boids.sy += (dy / d / d2) * 200 * massScale;
  }
  if (o.team === u.team) {
    if (d < 150) {
      _boids.chx += o.x;
      _boids.chy += o.y;
      _boids.cc++;
    }
    if (o.type === u.type && d < 120) {
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

  let fx = _boids.sx * 3,
    fy = _boids.sy * 3;
  if (_boids.ac > 0) {
    fx += (_boids.ax / _boids.ac - u.vx) * 0.5;
    fy += (_boids.ay / _boids.ac - u.vy) * 0.5;
  }
  if (_boids.cc > 0) {
    fx += (_boids.chx / _boids.cc - u.x) * 0.01;
    fy += (_boids.chy / _boids.cc - u.y) * 0.01;
  }
  _force.x = fx;
  _force.y = fy;
  return _force;
}

function computeEngagementForce(u: Unit, tgt: UnitIndex, t: UnitType, dt: number, rng: () => number): SteerForce {
  if (tgt !== NO_UNIT) {
    const o = unit(tgt);
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (t.rams) {
      _force.x = (dx / d) * t.speed * 3;
      _force.y = (dy / d) * t.speed * 3;
      return _force;
    }
    if (d > t.range * 0.7) {
      _force.x = (dx / d) * t.speed * 2;
      _force.y = (dy / d) * t.speed * 2;
      return _force;
    }
    if (d < t.range * 0.3) {
      _force.x = -(dx / d) * t.speed;
      _force.y = (dy / d) * t.speed * 0.5;
      return _force;
    }
    _force.x = (-dy / d) * t.speed * 0.8;
    _force.y = (dx / d) * t.speed * 0.8;
    return _force;
  }
  u.wanderAngle += (rng() - 0.5) * 2 * dt;
  _force.x = Math.cos(u.wanderAngle) * t.speed * 0.5;
  _force.y = Math.sin(u.wanderAngle) * t.speed * 0.5;
  return _force;
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
    _force.x = (o.x - u.x) * 0.05;
    _force.y = (o.y - u.y) * 0.05;
    return _force;
  }
  _force.x = 0;
  _force.y = 0;
  return _force;
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

export function steer(u: Unit, dt: number, rng: () => number) {
  if (u.stun > 0) {
    u.stun -= dt;
    tickBoostDuringStun(u, dt);
    const stunDrag = (0.93 ** (1 / Math.sqrt(unitType(u.type).mass))) ** (dt * REF_FPS);
    u.vx *= stunDrag;
    u.vy *= stunDrag;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    return;
  }
  const t = unitType(u.type);
  const nn = getNeighbors(u.x, u.y, 200);

  const boids = computeBoidsForce(u, nn, t);
  let fx = boids.x,
    fy = boids.y;

  const tgt = findTarget(u, nn, t.range, dt, rng);
  u.target = tgt;

  const engage = computeEngagementForce(u, tgt, t, dt, rng);
  fx += engage.x;
  fy += engage.y;

  if (t.heals) {
    const heal = computeHealerFollow(u, nn);
    fx += heal.x;
    fy += heal.y;
  }

  const m = WORLD_SIZE * 0.8;
  if (u.x < -m) fx += 120;
  if (u.x > m) fx -= 120;
  if (u.y < -m) fy += 120;
  if (u.y > m) fy -= 120;

  const da = Math.atan2(fy, fx);
  let ad = da - u.angle;
  if (ad > PI) ad -= TAU;
  if (ad < -PI) ad += TAU;
  u.angle += ad * t.turnRate * dt;

  const spd = t.speed * (1 + u.vet * 0.12);

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
  u.x += u.vx * dt;
  u.y += u.vy * dt;
}
