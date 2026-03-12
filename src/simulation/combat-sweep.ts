import { normalizeAngleDelta } from '../angle.ts';
import { BEAM_DECAY_RATE, SH_CIRCLE } from '../constants.ts';
import { unitIdx } from '../pool-index.ts';
import { unit } from '../pools-query.ts';
import type { UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { applyBeamDefenses } from './combat-beam-defense.ts';
import type { CombatContext } from './combat-context.ts';
import { sweepAfterimage, sweepGlowRing, sweepPathParticles, sweepTipSpark } from './combat-sweep-effects.ts';
import { destroyUnit } from './effects.ts';
import { emitDamage } from './hooks.ts';
import { DAMAGE_KIND_TO_KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback, NEIGHBOR_BUFFER_SIZE } from './spatial-hash.ts';
import { spawnParticle } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';
import { onKillUnitPermanent } from './spawn-hooks.ts';

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
  for (let k = 0; k < nn; k++) {
    _sweepSnapshot[k] = getNeighborAt(k);
  }
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
  const kind = 'sweep';
  knockback(ni, u.x, u.y, dmg * 3);
  emitDamage(u.type, u.team, n.type, n.team, dmg, kind);
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
    destroyUnit(ni, ctx.ui, ctx.rng, DAMAGE_KIND_TO_KILL_CONTEXT[kind], ctx.shake);
  }
}

function readSweepSnapshot(i: number): UnitIndex {
  return unitIdx(_sweepSnapshot[i] ?? 0);
}

const _sweepDelta = { dx: 0, dy: 0 };

function sweepCandidateDelta(
  n: CombatContext['u'],
  team: number,
  ux: number,
  uy: number,
  rangeSq: number,
): typeof _sweepDelta | null {
  if (!n.alive || n.team === team) {
    return null;
  }
  _sweepDelta.dx = n.x - ux;
  _sweepDelta.dy = n.y - uy;
  if (_sweepDelta.dx * _sweepDelta.dx + _sweepDelta.dy * _sweepDelta.dy >= rangeSq) {
    return null;
  }
  return _sweepDelta;
}

function sweepThroughDamage(ctx: CombatContext, prevAngle: number, currAngle: number) {
  const { u, t, vd } = ctx;
  const base = u.sweepBaseAngle;
  const TOL = 0.05;
  _sweepSnapshotCount = snapshotNeighbors(u.x, u.y, t.range);

  const relPrev = normalizeAngleDelta(prevAngle, base);
  const relCurr = normalizeAngleDelta(currAngle, base);
  const lo = Math.min(relPrev, relCurr) - TOL;
  const hi = Math.max(relPrev, relCurr) + TOL;
  const rangeSq = t.range * t.range;

  for (let i = 0; i < _sweepSnapshotCount; i++) {
    const ni = readSweepSnapshot(i);
    const n = unit(ni);
    const delta = sweepCandidateDelta(n, u.team, u.x, u.y, rangeSq);
    if (!delta) {
      continue;
    }
    const relEnemy = normalizeAngleDelta(Math.atan2(delta.dy, delta.dx), base);
    if (relEnemy < lo || relEnemy > hi) {
      continue;
    }
    if (sweepHitMap.get(ctx.ui)?.has(ni)) {
      continue;
    }
    sweepHitMap.get(ctx.ui)?.add(ni);
    const dmg = applyBeamDefenses(n, ni, t.damage * vd, ctx.rng, ctx.ui, ctx.shake);
    if (dmg < 0) {
      continue;
    }
    if (!u.alive) {
      return;
    }
    applySweepHit(ctx, ni, n, dmg);
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

  sweepAfterimage(ctx, ox, oy, easeAt);
  sweepTipSpark(ctx, beamEndX, beamEndY);
  sweepPathParticles(ctx, ox, oy, beamEndX, beamEndY, currAngle);
  sweepGlowRing(ctx, beamEndX, beamEndY);

  sweepThroughDamage(ctx, prevAngle, currAngle);

  if (u.sweepPhase >= 1) {
    u.cooldown = t.fireRate;
    u.sweepPhase = 0;
    releaseSweepSet(ctx.ui);
  }
}
