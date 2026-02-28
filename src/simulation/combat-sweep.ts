import { BEAM_DECAY_RATE, REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Color3, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { applyBeamDefenses } from './combat-beam-defense.ts';
import type { CombatContext } from './combat-context.ts';
import { destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback, NEIGHBOR_BUFFER_SIZE } from './spatial-hash.ts';
import { addBeam, onKillUnitPermanent, spawnParticle } from './spawn.ts';

export const SWEEP_DURATION = 0.8;
const HALF_ARC = (30 * Math.PI) / 180;

const sweepHitMap = new Map<UnitIndex, Set<UnitIndex>>();
const _sweepSetPool: Set<UnitIndex>[] = [];

function acquireSweepSet(): Set<UnitIndex> {
  return _sweepSetPool.pop() ?? new Set();
}

function releaseSweepSet(ui: UnitIndex) {
  const s = sweepHitMap.get(ui);
  if (s) {
    s.clear();
    _sweepSetPool.push(s);
  }
  sweepHitMap.delete(ui);
}

// neighborBuffer 上書き防止用スナップショット（beam反射で getNeighbors が再呼び出しされるため）
const _sweepSnapshot = new Int32Array(NEIGHBOR_BUFFER_SIZE);
let _sweepSnapshotCount = 0;

function snapshotNeighbors(x: number, y: number, r: number): number {
  const nn = getNeighbors(x, y, r);
  for (let k = 0; k < nn; k++) _sweepSnapshot[k] = getNeighborAt(k);
  return nn;
}

export function _resetSweepHits() {
  for (const s of sweepHitMap.values()) {
    s.clear();
    _sweepSetPool.push(s);
  }
  sweepHitMap.clear();
}

onKillUnitPermanent((e) => releaseSweepSet(e.victim));

/** sweep ヒット1件を適用。反射でattacker死亡なら true を返す */
function applySweepHit(ctx: CombatContext, ni: UnitIndex, n: CombatContext['u'], dmg: number) {
  const { u, c } = ctx;
  n.hp -= dmg;
  n.hitFlash = 1;
  knockback(ni, u.x, u.y, dmg * 3);
  spawnParticle(
    n.x + (ctx.rng() - 0.5) * 8,
    n.y + (ctx.rng() - 0.5) * 8,
    (ctx.rng() - 0.5) * 50,
    (ctx.rng() - 0.5) * 50,
    0.08,
    2,
    c[0],
    c[1],
    c[2],
    SH_CIRCLE,
  );
  if (n.hp <= 0) {
    destroyUnit(ni, ctx.ui, ctx.rng, KILL_CONTEXT.SweepBeam);
  }
}

function sweepThroughDamage(ctx: CombatContext, prevAngle: number, currAngle: number) {
  const { u, t, vd } = ctx;
  const base = u.sweepBaseAngle;
  const TOL = 0.05;
  _sweepSnapshotCount = snapshotNeighbors(u.x, u.y, t.range);

  const normalize = (a: number): number => {
    let r = a - base;
    while (r > Math.PI) r -= Math.PI * 2;
    while (r < -Math.PI) r += Math.PI * 2;
    return r;
  };

  const relPrev = normalize(prevAngle);
  const relCurr = normalize(currAngle);
  const lo = Math.min(relPrev, relCurr) - TOL;
  const hi = Math.max(relPrev, relCurr) + TOL;

  for (let i = 0; i < _sweepSnapshotCount; i++) {
    const ni = _sweepSnapshot[i] as UnitIndex;
    const n = unit(ni);
    if (!n.alive || n.team === u.team) continue;
    const ndx = n.x - u.x,
      ndy = n.y - u.y;
    const nd = Math.sqrt(ndx * ndx + ndy * ndy);
    if (nd >= t.range) continue;
    const nAngle = Math.atan2(ndy, ndx);
    const relEnemy = normalize(nAngle);
    if (relEnemy < lo || relEnemy > hi) continue;
    if (sweepHitMap.get(ctx.ui)?.has(ni)) continue;
    sweepHitMap.get(ctx.ui)?.add(ni);
    const dmg = applyBeamDefenses(n, ni, t.damage * vd, ctx.rng, ctx.ui);
    if (dmg < 0) continue;
    if (!u.alive) return;
    applySweepHit(ctx, ni, n, dmg);
  }
}

function sweepAfterimage(
  u: CombatContext['u'],
  ox: number,
  oy: number,
  easeAt: (p: number) => number,
  c: Color3,
  range: number,
) {
  const trails: [number, number, number, number][] = [
    [0.08, 0.35, 4, 0.1],
    [0.18, 0.15, 2.5, 0.12],
  ];
  for (const [phaseOffset, colorMul, width, opacity] of trails) {
    if (u.sweepPhase > phaseOffset) {
      const angle = u.sweepBaseAngle + easeAt(u.sweepPhase - phaseOffset);
      addBeam(
        ox,
        oy,
        u.x + Math.cos(angle) * range,
        u.y + Math.sin(angle) * range,
        c[0] * colorMul,
        c[1] * colorMul,
        c[2] * colorMul,
        opacity,
        width,
        false,
        2,
      );
    }
  }
}

function sweepTipSpark(ctx: CombatContext, x: number, y: number, c: Color3, dt: number) {
  if (ctx.rng() < 1 - 0.45 ** (dt * REF_FPS)) {
    const a = ctx.rng() * Math.PI * 2;
    const s = 40 + ctx.rng() * 100;
    spawnParticle(
      x,
      y,
      Math.cos(a) * s,
      Math.sin(a) * s,
      0.12 + ctx.rng() * 0.1,
      3 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
}

function sweepPathParticles(
  ctx: CombatContext,
  ox: number,
  oy: number,
  endX: number,
  endY: number,
  beamAngle: number,
  c: Color3,
  dt: number,
) {
  if (ctx.rng() < 1 - 0.7 ** (dt * REF_FPS)) {
    const along = 0.3 + ctx.rng() * 0.6;
    const px = ox + (endX - ox) * along;
    const py = oy + (endY - oy) * along;
    const drift = (ctx.rng() - 0.5) * 30;
    const perp = beamAngle + Math.PI * 0.5;
    spawnParticle(
      px + Math.cos(perp) * drift,
      py + Math.sin(perp) * drift,
      (ctx.rng() - 0.5) * 20,
      (ctx.rng() - 0.5) * 20,
      0.06 + ctx.rng() * 0.04,
      1.5 + ctx.rng() * 1.5,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
}

function sweepGlowRing(ctx: CombatContext, x: number, y: number, c: Color3, dt: number) {
  if (ctx.rng() < 1 - 0.75 ** (dt * REF_FPS)) {
    spawnParticle(x, y, 0, 0, 0.1, 12 + ctx.rng() * 6, c[0], c[1], c[2], SH_EXPLOSION_RING);
  }
}

export function sweepBeam(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;

  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    u.sweepPhase = 0;
    releaseSweepSet(ctx.ui);
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    u.sweepPhase = 0;
    releaseSweepSet(ctx.ui);
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= ctx.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    u.sweepPhase = 0;
    releaseSweepSet(ctx.ui);
    return;
  }

  if (u.sweepPhase === 0 && u.cooldown > 0) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    return;
  }

  if (u.sweepPhase === 0) {
    u.sweepBaseAngle = Math.atan2(dy, dx);
    u.sweepPhase = 0.001;
    u.beamOn = 1;
    sweepHitMap.set(ctx.ui, acquireSweepSet());
  }

  const prevPhase = u.sweepPhase;
  u.sweepPhase = Math.min(u.sweepPhase + dt / SWEEP_DURATION, 1);

  const easeAt = (p: number): number => {
    const e = p * p * (3 - 2 * p);
    return HALF_ARC - e * HALF_ARC * 2;
  };
  const prevOffset = easeAt(prevPhase);
  const currOffset = easeAt(u.sweepPhase);
  const prevAngle = u.sweepBaseAngle + prevOffset;
  const currAngle = u.sweepBaseAngle + currOffset;

  const beamEndX = u.x + Math.cos(currAngle) * t.range;
  const beamEndY = u.y + Math.sin(currAngle) * t.range;
  const ox = u.x + Math.cos(u.angle) * t.size * 0.5;
  const oy = u.y + Math.sin(u.angle) * t.size * 0.5;
  addBeam(ox, oy, beamEndX, beamEndY, c[0], c[1], c[2], 0.06, 6, true);

  sweepAfterimage(u, ox, oy, easeAt, c, t.range);
  sweepTipSpark(ctx, beamEndX, beamEndY, c, dt);
  sweepPathParticles(ctx, ox, oy, beamEndX, beamEndY, currAngle, c, dt);
  sweepGlowRing(ctx, beamEndX, beamEndY, c, dt);

  sweepThroughDamage(ctx, prevAngle, currAngle);

  if (u.sweepPhase >= 1) {
    u.cooldown = t.fireRate;
    u.sweepPhase = 0;
    releaseSweepSet(ctx.ui);
  }
}
