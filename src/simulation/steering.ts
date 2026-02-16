import { PI, POOL_UNITS, REF_FPS, TAU, WORLD_SIZE } from '../constants.ts';
import { getUnit } from '../pools.ts';
import { rng } from '../state.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';

interface SteerForce {
  x: number;
  y: number;
}

// 再利用ベクトル — 各 compute 関数が上書きして返却する
// 呼び出し側は返却後すぐに fx/fy に転写すること
const _force: SteerForce = { x: 0, y: 0 };

function findTarget(u: Unit, nn: number, range: number, dt: number): UnitIndex {
  if (u.target !== NO_UNIT && getUnit(u.target).alive) return u.target;

  let bd = range * 3,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (o.team === u.team || !o.alive) continue;
    const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
    if (d < bd) {
      bd = d;
      bi = oi;
    }
  }
  if (bi === NO_UNIT && rng() < 1 - (1 - 0.012) ** (dt * REF_FPS)) {
    bd = 1e18;
    for (let i = 0; i < POOL_UNITS; i++) {
      const o = getUnit(i);
      if (!o.alive || o.team === u.team) continue;
      const d2 = (o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y);
      if (d2 < bd) {
        bd = d2;
        bi = i as UnitIndex;
      }
    }
  }
  return bi;
}

function computeBoidsForce(u: Unit, nn: number, t: UnitType): SteerForce {
  let sx = 0,
    sy = 0,
    ax = 0,
    ay = 0,
    ac = 0,
    chx = 0,
    chy = 0,
    cc = 0;
  const sd = t.size * 4;

  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o === u) continue;
    const dx = u.x - o.x,
      dy = u.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) continue;
    const d = Math.sqrt(d2);
    if (d < sd) {
      sx += (dx / d / d2) * 200;
      sy += (dy / d / d2) * 200;
    }
    if (o.team === u.team) {
      if (d < 150) {
        chx += o.x;
        chy += o.y;
        cc++;
      }
      if (o.type === u.type && d < 120) {
        ax += o.vx;
        ay += o.vy;
        ac++;
      }
    }
  }
  let fx = sx * 3,
    fy = sy * 3;
  if (ac > 0) {
    fx += (ax / ac - u.vx) * 0.5;
    fy += (ay / ac - u.vy) * 0.5;
  }
  if (cc > 0) {
    fx += (chx / cc - u.x) * 0.01;
    fy += (chy / cc - u.y) * 0.01;
  }
  _force.x = fx;
  _force.y = fy;
  return _force;
}

function computeEngagementForce(u: Unit, tgt: UnitIndex, t: UnitType, dt: number): SteerForce {
  if (tgt !== NO_UNIT) {
    const o = getUnit(tgt);
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
      o = getUnit(oi);
    if (o.team !== u.team || !o.alive || o === u) continue;
    if (getUnitType(o.type).mass > bm) {
      bm = getUnitType(o.type).mass;
      bi = oi;
    }
  }
  if (bi !== NO_UNIT) {
    const o = getUnit(bi);
    _force.x = (o.x - u.x) * 0.05;
    _force.y = (o.y - u.y) * 0.05;
    return _force;
  }
  _force.x = 0;
  _force.y = 0;
  return _force;
}

export function steer(u: Unit, dt: number) {
  if (u.stun > 0) {
    u.stun -= dt;
    const stunDrag = 0.93 ** (dt * REF_FPS);
    u.vx *= stunDrag;
    u.vy *= stunDrag;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    return;
  }
  const t = getUnitType(u.type);
  const nn = getNeighbors(u.x, u.y, 200);

  const boids = computeBoidsForce(u, nn, t);
  let fx = boids.x,
    fy = boids.y;

  const tgt = findTarget(u, nn, t.range, dt);
  u.target = tgt;

  const engage = computeEngagementForce(u, tgt, t, dt);
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
  u.vx += (Math.cos(u.angle) * spd - u.vx) * dt * 3;
  u.vy += (Math.sin(u.angle) * spd - u.vy) * dt * 3;
  u.vx *= 1 - dt * 0.5;
  u.vy *= 1 - dt * 0.5;
  u.x += u.vx * dt;
  u.y += u.vy * dt;
}
