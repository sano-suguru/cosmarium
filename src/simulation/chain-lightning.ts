import { SH_CIRCLE } from '../constants.ts';
import { unit } from '../pools-query.ts';
import { swapRemove } from '../swap-remove.ts';
import type { Team } from '../team.ts';
import type { Color3, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import type { ShakeFn } from './combat-context.ts';
import { destroyUnit } from './effects.ts';
import { emitDamage } from './hooks.ts';
import { DAMAGE_KIND_TO_KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import type { Killer } from './spawn.ts';
import { spawnParticle } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';

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
  sourceKiller: Killer;
  elapsed: number;
  nextHop: number;
}

const pendingChains: PendingChain[] = [];
const CHAIN_HOP_DELAY = 0.06;
const CHAIN_SEARCH_RANGE = 200;
export const CHAIN_DAMAGE_DECAY = 0.18;

export function resetChains() {
  pendingChains.length = 0;
}

export function snapshotChains() {
  return pendingChains.map((pc) => ({
    hops: pc.hops.map((h) => ({ ...h, col: [h.col[0], h.col[1], h.col[2]] as Color3 })),
    team: pc.team,
    sourceKiller: { ...pc.sourceKiller },
    elapsed: pc.elapsed,
    nextHop: pc.nextHop,
  }));
}

export function restoreChains(snapshot: ReturnType<typeof snapshotChains>) {
  pendingChains.length = 0;
  for (const pc of snapshot) {
    pendingChains.push({
      hops: pc.hops.map((h) => ({ ...h, col: [h.col[0], h.col[1], h.col[2]] as Color3 })),
      team: pc.team,
      sourceKiller: { ...pc.sourceKiller },
      elapsed: pc.elapsed,
      nextHop: pc.nextHop,
    });
  }
}

/** @returns true if all hops are done and the chain should be removed */
function advanceChainHops(pc: PendingChain, dt: number, rng: () => number, shake: ShakeFn): boolean {
  pc.elapsed += dt;
  while (pc.nextHop < pc.hops.length && pc.elapsed >= (pc.nextHop + 1) * CHAIN_HOP_DELAY) {
    const hop = pc.hops[pc.nextHop];
    if (hop === undefined) {
      pc.nextHop = pc.hops.length;
      break;
    }
    fireChainHop(hop, pc.sourceKiller, rng, shake);
    pc.nextHop += 1;
  }
  return pc.nextHop >= pc.hops.length;
}

export function updateChains(dt: number, rng: () => number, shake: ShakeFn) {
  for (let i = pendingChains.length - 1; i >= 0; i--) {
    const pc = pendingChains[i];
    if (pc === undefined) {
      continue;
    }
    if (advanceChainHops(pc, dt, rng, shake)) {
      swapRemove(pendingChains, i);
    }
  }
}

function emitChainVisual(fx: number, fy: number, tx: number, ty: number, col: Color3, rng: () => number) {
  addBeam(fx, fy, tx, ty, col[0], col[1], col[2], 0.45, 3.5, false, 1, true);
  const pCount = 8 + ((rng() * 4) | 0);
  for (let i = 0; i < pCount; i++) {
    spawnParticle(
      tx + (rng() - 0.5) * 8,
      ty + (rng() - 0.5) * 8,
      (rng() - 0.5) * 120,
      (rng() - 0.5) * 120,
      0.15,
      3.0,
      col[0],
      col[1],
      col[2],
      SH_CIRCLE,
    );
  }
}

function fireChainHop(hop: ChainHop, sourceKiller: Killer, rng: () => number, shake: ShakeFn) {
  const from = hop.fromIndex !== NO_UNIT ? unit(hop.fromIndex) : undefined;
  const fx = from?.alive ? from.x : hop.fromX;
  const fy = from?.alive ? from.y : hop.fromY;
  const o = unit(hop.targetIndex);
  const tx = o.alive ? o.x : hop.toX;
  const ty = o.alive ? o.y : hop.toY;
  emitChainVisual(fx, fy, tx, ty, hop.col, rng);
  if (o.alive) {
    o.hp -= hop.damage;
    o.hitFlash = 1;
    knockback(hop.targetIndex, fx, fy, hop.damage * 8);
    const kind = 'chain';
    emitDamage(sourceKiller.type, sourceKiller.team, o.type, o.team, hop.damage, kind);
    if (o.hp <= 0) {
      destroyUnit(hop.targetIndex, sourceKiller, rng, DAMAGE_KIND_TO_KILL_CONTEXT[kind], shake);
    }
  }
}

function findNearestEnemy(cx: number, cy: number, team: Team, hit: Set<UnitIndex>): UnitIndex {
  const nn = getNeighbors(cx, cy, CHAIN_SEARCH_RANGE);
  let bd = CHAIN_SEARCH_RANGE,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (!o.alive || o.team === team || hit.has(oi)) {
      continue;
    }
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
  sourceKiller: Killer,
  rng: () => number,
  shake: ShakeFn,
): { hx: number; hy: number } {
  const o = unit(bi);
  const hx = o.x,
    hy = o.y;
  emitChainVisual(cx, cy, hx, hy, col, rng);
  const dd = damage * (1 - ch * CHAIN_DAMAGE_DECAY);
  o.hp -= dd;
  o.hitFlash = 1;
  knockback(bi, cx, cy, dd * 8);
  const chainKind = 'chain';
  emitDamage(sourceKiller.type, sourceKiller.team, o.type, o.team, dd, chainKind);
  if (o.hp <= 0) {
    destroyUnit(bi, sourceKiller, rng, DAMAGE_KIND_TO_KILL_CONTEXT[chainKind], shake);
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
  sourceKiller: Killer,
  rng: () => number,
  shake: ShakeFn,
) {
  let cx = sx,
    cy = sy;
  let prevTarget: UnitIndex = NO_UNIT;
  const hit = new Set<UnitIndex>();
  const hops: ChainHop[] = [];
  for (let ch = 0; ch < max; ch++) {
    const bi = findNearestEnemy(cx, cy, team, hit);
    if (bi === NO_UNIT) {
      break;
    }
    hit.add(bi);
    if (ch === 0) {
      const pos = applyChainHit(cx, cy, bi, damage, ch, col, sourceKiller, rng, shake);
      cx = pos.hx;
      cy = pos.hy;
      prevTarget = unit(bi).alive ? bi : NO_UNIT;
      continue;
    }
    const o = unit(bi);
    hops.push({
      fromIndex: prevTarget,
      fromX: cx,
      fromY: cy,
      toX: o.x,
      toY: o.y,
      targetIndex: bi,
      damage: damage * (1 - ch * CHAIN_DAMAGE_DECAY),
      col: [col[0], col[1], col[2]],
    });
    cx = o.x;
    cy = o.y;
    prevTarget = bi;
  }
  if (hops.length > 0) {
    pendingChains.push({ hops, team, sourceKiller, elapsed: 0, nextHop: 0 });
  }
}
