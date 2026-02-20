import { getColor, getTrailColor } from '../colors.ts';
import { POOL_UNITS, REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING, TAU } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { getUnit } from '../pools.ts';
import type { Color3, Team, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, killUnit, spawnParticle } from './spawn.ts';

function spawnExplosionDebris(x: number, y: number, size: number, c: Color3, rng: () => number) {
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
      SH_CIRCLE,
    );
  }
}

function spawnExplosionFlash(x: number, y: number, size: number, rng: () => number) {
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
      SH_CIRCLE,
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

export function explosion(x: number, y: number, team: Team, type: number, killer: UnitIndex, rng: () => number) {
  const size = getUnitType(type).size;
  const c = getColor(type, team);

  spawnExplosionDebris(x, y, size, c, rng);
  spawnExplosionFlash(x, y, size, rng);

  const dc = Math.min((size * 2) | 0, 14);
  for (let i = 0; i < dc; i++) {
    const a = rng() * 6.283;
    const sp = 15 + rng() * 140;
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + rng() * 2, 1 + rng() * 2, 0.5, 0.35, 0.2, SH_CIRCLE);
  }
  spawnParticle(x, y, 0, 0, 0.45, size * 2.5, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, SH_EXPLOSION_RING);

  if (size >= 14) addShake(size * 0.8);

  applyKnockbackToNeighbors(x, y, size);
  updateKillerVet(killer);
}

export function trail(u: Unit, rng: () => number) {
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
    SH_CIRCLE,
  );
}

interface ChainHop {
  fromIndex: UnitIndex; // 前ホップのターゲット（ビーム起点のライブ座標に使う）
  fromX: number; // フォールバック座標（fromIndex が死亡/再利用時）
  fromY: number;
  toX: number;
  toY: number;
  targetIndex: UnitIndex;
  damage: number;
  col: Color3;
}

interface PendingChain {
  hops: ChainHop[];
  team: Team;
  elapsed: number;
  nextHop: number;
}

const pendingChains: PendingChain[] = [];
const CHAIN_HOP_DELAY = 0.06;

export function resetPendingChains() {
  pendingChains.length = 0;
}

export function snapshotPendingChains() {
  return pendingChains.map((pc) => ({
    hops: pc.hops.map((h) => ({ ...h, col: [h.col[0], h.col[1], h.col[2]] as Color3 })),
    team: pc.team,
    elapsed: pc.elapsed,
    nextHop: pc.nextHop,
  }));
}

export function restorePendingChains(snapshot: ReturnType<typeof snapshotPendingChains>) {
  pendingChains.length = 0;
  for (const pc of snapshot) {
    pendingChains.push({
      hops: pc.hops.map((h) => ({ ...h, col: [h.col[0], h.col[1], h.col[2]] as Color3 })),
      team: pc.team,
      elapsed: pc.elapsed,
      nextHop: pc.nextHop,
    });
  }
}

/** @returns true if all hops are done and the chain should be removed */
function advanceChainHops(pc: PendingChain, dt: number, rng: () => number): boolean {
  pc.elapsed += dt;
  while (pc.nextHop < pc.hops.length && pc.elapsed >= (pc.nextHop + 1) * CHAIN_HOP_DELAY) {
    const hop = pc.hops[pc.nextHop];
    if (hop === undefined) {
      pc.nextHop = pc.hops.length;
      break;
    }
    fireChainHop(hop, rng);
    pc.nextHop += 1;
  }
  return pc.nextHop >= pc.hops.length;
}

export function updatePendingChains(dt: number, rng: () => number) {
  for (let i = pendingChains.length - 1; i >= 0; i--) {
    const pc = pendingChains[i];
    if (pc === undefined) continue;
    if (advanceChainHops(pc, dt, rng)) {
      const last = pendingChains[pendingChains.length - 1];
      if (last !== undefined) pendingChains[i] = last;
      pendingChains.pop();
    }
  }
}

function emitChainVisual(fx: number, fy: number, tx: number, ty: number, col: Color3, rng: () => number) {
  addBeam(fx, fy, tx, ty, col[0], col[1], col[2], 0.3, 2.5, undefined, undefined, true);
  const pCount = 6 + ((rng() * 3) | 0);
  for (let i = 0; i < pCount; i++) {
    spawnParticle(
      tx + (rng() - 0.5) * 8,
      ty + (rng() - 0.5) * 8,
      (rng() - 0.5) * 80,
      (rng() - 0.5) * 80,
      0.15,
      2.5,
      col[0],
      col[1],
      col[2],
      SH_CIRCLE,
    );
  }
}

function fireChainHop(hop: ChainHop, rng: () => number) {
  const from = hop.fromIndex !== NO_UNIT ? getUnit(hop.fromIndex) : undefined;
  const fx = from?.alive ? from.x : hop.fromX;
  const fy = from?.alive ? from.y : hop.fromY;
  const o = getUnit(hop.targetIndex);
  const tx = o.alive ? o.x : hop.toX;
  const ty = o.alive ? o.y : hop.toY;
  emitChainVisual(fx, fy, tx, ty, hop.col, rng);
  if (o.alive) {
    o.hp -= hop.damage;
    knockback(hop.targetIndex, fx, fy, hop.damage * 8);
    if (o.hp <= 0) {
      const hx = o.x,
        hy = o.y,
        hTeam = o.team,
        hType = o.type;
      killUnit(hop.targetIndex);
      explosion(hx, hy, hTeam, hType, NO_UNIT, rng);
    }
  }
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
  rng: () => number,
): { hx: number; hy: number } {
  const o = getUnit(bi);
  // kill 前に退避 — killUnit でスロットが再利用されると値が壊れる
  const hx = o.x,
    hy = o.y,
    hTeam = o.team,
    hType = o.type;
  emitChainVisual(cx, cy, hx, hy, col, rng);
  const dd = damage * (1 - ch * 0.12);
  o.hp -= dd;
  knockback(bi, cx, cy, dd * 8);
  if (o.hp <= 0) {
    killUnit(bi);
    explosion(hx, hy, hTeam, hType, NO_UNIT, rng);
  }
  return { hx, hy };
}

export function chainLightning(
  sx: number,
  sy: number,
  team: Team,
  damage: number,
  max: number,
  col: Color3,
  rng: () => number,
) {
  let cx = sx,
    cy = sy;
  let prevTarget: UnitIndex = NO_UNIT;
  const hit = new Set<UnitIndex>();
  const hops: ChainHop[] = [];
  for (let ch = 0; ch < max; ch++) {
    const bi = findNearestEnemy(cx, cy, team, hit);
    if (bi === NO_UNIT) break;
    hit.add(bi);
    if (ch === 0) {
      const pos = applyChainHit(cx, cy, bi, damage, ch, col, rng);
      cx = pos.hx;
      cy = pos.hy;
      // killUnit後にスロットが再利用されると後続ホップで無関係なユニットにスナップするため、
      // 死亡時はNO_UNITにしてフォールバック座標を使わせる
      prevTarget = getUnit(bi).alive ? bi : NO_UNIT;
      continue;
    }
    const o = getUnit(bi);
    hops.push({
      fromIndex: prevTarget,
      fromX: cx,
      fromY: cy,
      toX: o.x,
      toY: o.y,
      targetIndex: bi,
      damage: damage * (1 - ch * 0.12),
      col: [col[0], col[1], col[2]],
    });
    cx = o.x;
    cy = o.y;
    prevTarget = bi;
  }
  if (hops.length > 0) {
    pendingChains.push({ hops, team, elapsed: 0, nextHop: 0 });
  }
}

export function boostBurst(u: Unit, rng: () => number) {
  const t = getUnitType(u.type);
  const c = getTrailColor(u.type, u.team);
  const bx = u.x - Math.cos(u.angle) * t.size * 0.8;
  const by = u.y - Math.sin(u.angle) * t.size * 0.8;

  for (let i = 0; i < 10; i++) {
    const angle = i * (TAU / 10) + rng() * 0.3;
    const speed = 60 + rng() * 40;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = 0.15 + rng() * 0.1;
    const size = t.size * 0.4 + rng() * 2;
    spawnParticle(bx, by, vx, vy, life, size, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, SH_CIRCLE);
  }
}

export function boostTrail(u: Unit, dt: number, rng: () => number) {
  if (rng() < 1 - 0.6 ** (dt * REF_FPS)) {
    const t = getUnitType(u.type);
    const c = getTrailColor(u.type, u.team);
    const cos = Math.cos(u.angle);
    const sin = Math.sin(u.angle);
    const ox = u.x - cos * t.size * 0.8 + (rng() - 0.5) * t.size * 0.5;
    const oy = u.y - sin * t.size * 0.8 + (rng() - 0.5) * t.size * 0.5;
    const vx = -cos * 40 + (rng() - 0.5) * 20;
    const vy = -sin * 40 + (rng() - 0.5) * 20;
    const life = 0.08 + rng() * 0.12;
    const size = t.size * 0.5 + rng() * 2;
    spawnParticle(ox, oy, vx, vy, life, size, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, SH_CIRCLE);
  }
}
