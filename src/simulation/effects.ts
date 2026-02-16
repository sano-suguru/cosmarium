import { getColor, getTrailColor } from '../colors.ts';
import { POOL_UNITS } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { getUnit } from '../pools.ts';
import { rng } from '../state.ts';
import type { Color3, Team, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, killUnit, spawnParticle } from './spawn.ts';

function spawnExplosionDebris(x: number, y: number, size: number, c: Color3) {
  const cnt = Math.min((18 + size * 3) | 0, 50);
  for (let i = 0; i < cnt; i++) {
    const a = rng() * 6.283;
    const sp = 40 + rng() * 200 * (size / 10);
    const lf = 0.3 + rng() * 0.8;
    spawnParticle(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      lf,
      2 + rng() * size * 0.4,
      c[0] * 0.5 + 0.5,
      c[1] * 0.5 + 0.5,
      c[2] * 0.5 + 0.5,
      0,
    );
  }
}

function spawnExplosionFlash(x: number, y: number, size: number) {
  for (let i = 0; i < 5; i++) {
    const a = rng() * 6.283;
    spawnParticle(
      x,
      y,
      Math.cos(a) * rng() * 50,
      Math.sin(a) * rng() * 50,
      0.1 + rng() * 0.12,
      size * 0.7 + rng() * 3,
      1,
      1,
      1,
      0,
    );
  }
}

function applyKnockbackToNeighbors(x: number, y: number, size: number) {
  const nn = getNeighbors(x, y, size * 8);
  for (let i = 0; i < nn; i++) {
    const o = getUnit(getNeighborAt(i));
    if (!o.alive) continue;
    const ddx = o.x - x,
      ddy = o.y - y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    if (dd < size * 8) knockback(getNeighborAt(i), x, y, (size * 50) / (dd * 0.1 + 1));
  }
}

function updateKillerVet(killer: UnitIndex) {
  if (killer !== NO_UNIT && killer < POOL_UNITS) {
    const ku = getUnit(killer);
    if (ku.alive) {
      ku.kills++;
      if (ku.kills >= 3) ku.vet = 1;
      if (ku.kills >= 8) ku.vet = 2;
    }
  }
}

export function explosion(x: number, y: number, team: Team, type: number, killer: UnitIndex) {
  const size = getUnitType(type).size;
  const c = getColor(type, team);

  spawnExplosionDebris(x, y, size, c);
  spawnExplosionFlash(x, y, size);

  const dc = Math.min((size * 2) | 0, 14);
  for (let i = 0; i < dc; i++) {
    const a = rng() * 6.283;
    const sp = 15 + rng() * 140;
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + rng() * 2, 1 + rng() * 2, 0.5, 0.35, 0.2, 0);
  }
  spawnParticle(x, y, 0, 0, 0.45, size * 2.5, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 10);

  if (size >= 14) addShake(size * 0.8);

  applyKnockbackToNeighbors(x, y, size);
  updateKillerVet(killer);
}

export function trail(u: Unit) {
  const t = getUnitType(u.type),
    c = getTrailColor(u.type, u.team);
  const bx = u.x - Math.cos(u.angle) * t.size * 0.8;
  const by = u.y - Math.sin(u.angle) * t.size * 0.8;
  spawnParticle(
    bx + (rng() - 0.5) * t.size * 0.3,
    by + (rng() - 0.5) * t.size * 0.3,
    -Math.cos(u.angle) * 25 + (rng() - 0.5) * 15,
    -Math.sin(u.angle) * 25 + (rng() - 0.5) * 15,
    0.1 + rng() * 0.22 * t.trailInterval,
    t.size * 0.3 + rng() * 1.5,
    c[0],
    c[1],
    c[2],
    0,
  );
}

function findNearestEnemy(cx: number, cy: number, team: Team, hit: Set<UnitIndex>): UnitIndex {
  const nn = getNeighbors(cx, cy, 200);
  let bd = 200,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o.team === team || hit.has(oi)) continue;
    const d = Math.sqrt((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy));
    if (d < bd) {
      bd = d;
      bi = oi;
    }
  }
  return bi;
}

// 不変条件: explosion() は chainLightning を再帰呼出ししない
function applyChainHit(
  cx: number,
  cy: number,
  bi: UnitIndex,
  damage: number,
  ch: number,
  col: Color3,
): { hx: number; hy: number } {
  const o = getUnit(bi);
  // kill 前に退避 — killUnit でスロットが再利用されると座標が壊れる
  const hx = o.x,
    hy = o.y;
  addBeam(cx, cy, hx, hy, col[0], col[1], col[2], 0.2, 1.5);
  for (let i = 0; i < 3; i++) {
    spawnParticle(
      hx + (rng() - 0.5) * 8,
      hy + (rng() - 0.5) * 8,
      (rng() - 0.5) * 50,
      (rng() - 0.5) * 50,
      0.1,
      2,
      col[0],
      col[1],
      col[2],
      0,
    );
  }
  const dd = damage * (1 - ch * 0.12);
  o.hp -= dd;
  knockback(bi, cx, cy, dd * 8);
  if (o.hp <= 0) {
    killUnit(bi);
    explosion(hx, hy, o.team, o.type, NO_UNIT);
  }
  return { hx, hy };
}

export function chainLightning(sx: number, sy: number, team: Team, damage: number, max: number, col: Color3) {
  let cx = sx,
    cy = sy;
  const hit = new Set<UnitIndex>();
  for (let ch = 0; ch < max; ch++) {
    const bi = findNearestEnemy(cx, cy, team, hit);
    if (bi === NO_UNIT) break;
    hit.add(bi);
    const pos = applyChainHit(cx, cy, bi, damage, ch, col);
    cx = pos.hx;
    cy = pos.hy;
  }
}
