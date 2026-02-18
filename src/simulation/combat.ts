import { getColor } from '../colors.ts';
import { POOL_PROJECTILES, REF_FPS } from '../constants.ts';
import { getProjectile, getUnit, poolCounts } from '../pools.ts';
import type { Color3, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { chainLightning, explosion } from './effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, killUnit, onKillUnit, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

const REFLECTOR_BEAM_SHIELD_MULTIPLIER = 0.4;
const SWEEP_DURATION = 0.8;
const BURST_INTERVAL = 0.07;
const HALF_ARC = 0.524; // ±30°
const sweepHitMap = new Map<UnitIndex, Set<UnitIndex>>();
/** 同一フレーム内で反射済みのプロジェクタイルインデックス。対向リフレクター間の無限バウンスを防止 */
const reflectedThisFrame = new Set<number>();

export function _resetSweepHits() {
  sweepHitMap.clear();
}

export function resetReflectedSet() {
  reflectedThisFrame.clear();
}

onKillUnit((i) => sweepHitMap.delete(i));

interface CombatContext {
  u: Unit;
  ui: UnitIndex;
  dt: number;
  c: Color3;
  vd: number;
  t: UnitType;
  rng: () => number;
}

// GC回避用の再利用シングルトン。combat() 呼び出し時に全フィールドを上書きする。
// シングルスレッド前提: ワーカー分離時は per-call 割り当てに変更が必要
const _ctx: CombatContext = {
  u: getUnit(0 as UnitIndex),
  ui: 0 as UnitIndex,
  dt: 0,
  c: [0, 0, 0],
  vd: 0,
  t: getUnitType(0),
  rng: () => {
    throw new Error('CombatContext.rng called before combat() initialization');
  },
};

function tgtDistOrClear(u: Unit): number {
  if (u.target === NO_UNIT) return -1;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return -1;
  }
  return Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
}

function handleRam(ctx: CombatContext) {
  const { u, ui, t, vd } = ctx;
  const nn = getNeighbors(u.x, u.y, t.size * 2);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o.team === u.team) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < t.size + getUnitType(o.type).size) {
      o.hp -= Math.ceil(u.mass * 3 * vd);
      knockback(oi, u.x, u.y, u.mass * 55);
      u.hp -= Math.ceil(getUnitType(o.type).mass);
      for (let k = 0; k < 10; k++) {
        const a = ctx.rng() * 6.283;
        spawnParticle(
          (u.x + o.x) / 2,
          (u.y + o.y) / 2,
          Math.cos(a) * (80 + ctx.rng() * 160),
          Math.sin(a) * (80 + ctx.rng() * 160),
          0.15,
          2 + ctx.rng() * 2,
          1,
          0.9,
          0.4,
          0,
        );
      }
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, ui, ctx.rng);
      }
      if (u.hp <= 0) {
        killUnit(ui);
        explosion(u.x, u.y, u.team, u.type, NO_UNIT, ctx.rng);
        return;
      }
    }
  }
}

function handleHealer(ctx: CombatContext) {
  const { u, ui } = ctx;
  u.abilityCooldown = 0.35;
  const nn = getNeighbors(u.x, u.y, 160);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o.team !== u.team || oi === ui) continue;
    if (o.hp < o.maxHp) {
      o.hp = Math.min(o.maxHp, o.hp + 3);
      addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
    }
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, 10);
}

const REFLECT_RADIUS_MULT = 3;
const REFLECT_SCATTER = 0.524; // 全幅30°（±15°）
const REFLECT_SPEED_MULT = 1.0;
const REFLECT_LIFE = 0.5;

function reflectProjectile(
  ctx: CombatContext,
  ux: number,
  uy: number,
  p: { x: number; y: number; vx: number; vy: number; life: number; team: number; r: number; g: number; b: number },
  team: number,
  c: Color3,
) {
  let dx = p.x - ux;
  let dy = p.y - uy;
  let nd = Math.sqrt(dx * dx + dy * dy);
  if (nd < 0.001) {
    // 弾がReflector中心と一致: 速度の逆方向を法線として使用
    dx = -p.vx;
    dy = -p.vy;
    nd = Math.sqrt(dx * dx + dy * dy) || 1;
  }
  const nx = dx / nd;
  const ny = dy / nd;
  // v' = v - 2(v·n)n
  const dot = p.vx * nx + p.vy * ny;
  const rvx = p.vx - 2 * dot * nx;
  const rvy = p.vy - 2 * dot * ny;
  const scatter = (ctx.rng() - 0.5) * REFLECT_SCATTER;
  const cs = Math.cos(scatter);
  const sn = Math.sin(scatter);
  p.vx = (rvx * cs - rvy * sn) * REFLECT_SPEED_MULT;
  p.vy = (rvx * sn + rvy * cs) * REFLECT_SPEED_MULT;
  p.life = REFLECT_LIFE;
  p.team = team;
  p.r = c[0];
  p.g = c[1];
  p.b = c[2];
  addBeam(ux, uy, p.x, p.y, c[0], c[1], c[2], 0.15, 1.5);
  for (let j = 0; j < 4; j++) {
    spawnParticle(
      p.x,
      p.y,
      (ctx.rng() - 0.5) * 80,
      (ctx.rng() - 0.5) * 80,
      0.15,
      3 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      0,
    );
  }
  spawnParticle(p.x, p.y, 0, 0, 0.12, 10, 1, 1, 1, 10);
}

function reflectNearbyProjectiles(ctx: CombatContext, u: Unit, reflectR: number, team: number, c: Color3) {
  for (let i = 0, rem = poolCounts.projectileCount; i < POOL_PROJECTILES && rem > 0; i++) {
    const p = getProjectile(i);
    if (!p.alive) continue;
    rem--;
    if (reflectedThisFrame.has(i) || p.team === team) continue;
    const dx = p.x - u.x;
    const dy = p.y - u.y;
    if (dx * dx + dy * dy < reflectR * reflectR) {
      reflectProjectile(ctx, u.x, u.y, p, team, c);
      reflectedThisFrame.add(i);
    }
  }
}

function handleReflector(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;
  const fireRange = t.range;
  const reflectR = t.size * REFLECT_RADIUS_MULT;
  reflectNearbyProjectiles(ctx, u, reflectR, u.team, c);
  if (u.cooldown <= 0 && u.target !== NO_UNIT) {
    const o = getUnit(u.target);
    if (!o.alive) {
      u.target = NO_UNIT;
    } else {
      const dx = o.x - u.x,
        dy = o.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < fireRange) {
        u.cooldown = t.fireRate;
        const ang = Math.atan2(dy, dx);
        spawnProjectile(
          u.x,
          u.y,
          Math.cos(ang) * 400,
          Math.sin(ang) * 400,
          d / 400 + 0.1,
          t.damage * vd,
          u.team,
          1.5,
          c[0],
          c[1],
          c[2],
        );
      }
    }
  }
  if (ctx.rng() < 1 - 0.9 ** (ctx.dt * REF_FPS)) {
    spawnParticle(
      u.x + (ctx.rng() - 0.5) * fireRange * 1.5,
      u.y + (ctx.rng() - 0.5) * fireRange * 1.5,
      0,
      0,
      0.15,
      2,
      c[0] * 0.5,
      c[1] * 0.5,
      c[2] * 0.5,
      0,
    );
  }
}

function handleCarrier(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;
  u.spawnCooldown -= dt;
  if (u.spawnCooldown <= 0) {
    u.spawnCooldown = 4 + ctx.rng() * 2;
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * 6.283;
      spawnUnit(u.team, 0, u.x + Math.cos(a) * t.size * 2, u.y + Math.sin(a) * t.size * 2, ctx.rng);
    }
    for (let i = 0; i < 10; i++) {
      const a = ctx.rng() * 6.283;
      spawnParticle(
        u.x + Math.cos(a) * t.size,
        u.y + Math.sin(a) * t.size,
        (ctx.rng() - 0.5) * 50,
        (ctx.rng() - 0.5) * 50,
        0.3,
        3,
        c[0],
        c[1],
        c[2],
        0,
      );
    }
  }
}

function handleEmp(ctx: CombatContext) {
  const { u, t } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0 || d >= t.range) return;
  u.abilityCooldown = t.fireRate;
  const nn = getNeighbors(u.x, u.y, t.range);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      oo = getUnit(oi);
    if (!oo.alive || oo.team === u.team) continue;
    if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) < t.range * t.range) {
      oo.stun = 1.5;
      oo.hp -= t.damage;
      if (oo.hp <= 0) {
        killUnit(oi);
        explosion(oo.x, oo.y, oo.team, oo.type, ctx.ui, ctx.rng);
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * 6.283,
      r = t.range * 0.8;
    spawnParticle(
      u.x + Math.cos(a) * r,
      u.y + Math.sin(a) * r,
      (ctx.rng() - 0.5) * 25,
      (ctx.rng() - 0.5) * 25,
      0.35,
      3,
      0.5,
      0.5,
      1,
      0,
    );
  }
  spawnParticle(u.x, u.y, 0, 0, 0.45, t.range * 0.7, 0.4, 0.4, 1, 10);
}

function handleTeleporter(ctx: CombatContext) {
  const { u, c, t, dt, vd } = ctx;
  u.teleportTimer -= dt;
  if (u.teleportTimer > 0 || u.target === NO_UNIT) return;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return;
  }
  const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
  if (d < 500 && d > 80) {
    u.teleportTimer = 3 + ctx.rng() * 2;
    for (let i = 0; i < 8; i++) {
      const a = ctx.rng() * 6.283;
      spawnParticle(u.x, u.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.25, 3, c[0], c[1], c[2], 0);
    }
    spawnParticle(u.x, u.y, 0, 0, 0.3, 16, c[0], c[1], c[2], 10);
    const ta = ctx.rng() * 6.283,
      td = 55 + ctx.rng() * 35;
    u.x = o.x + Math.cos(ta) * td;
    u.y = o.y + Math.sin(ta) * td;
    for (let i = 0; i < 8; i++) {
      const a = ctx.rng() * 6.283;
      spawnParticle(u.x, u.y, Math.cos(a) * 55, Math.sin(a) * 55, 0.2, 3, c[0], c[1], c[2], 0);
    }
    spawnParticle(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, 10);
    for (let i = 0; i < 5; i++) {
      const ba = ctx.rng() * 6.283;
      spawnProjectile(
        u.x,
        u.y,
        Math.cos(ba) * 430,
        Math.sin(ba) * 430,
        0.3,
        t.damage * vd,
        u.team,
        2,
        c[0],
        c[1],
        c[2],
      );
    }
  }
}

function handleChain(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0) return;
  if (d < t.range) {
    u.cooldown = t.fireRate;
    chainLightning(u.x, u.y, u.team, t.damage * vd, 5, c, ctx.rng);
    spawnParticle(u.x, u.y, 0, 0, 0.15, t.size, c[0], c[1], c[2], 10);
  }
}

function sweepThroughDamage(ctx: CombatContext, prevAngle: number, currAngle: number) {
  const { u, c, t, vd } = ctx;
  const base = u.sweepBaseAngle;
  const TOL = 0.05;
  const nn = getNeighbors(u.x, u.y, t.range);

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

  for (let i = 0; i < nn; i++) {
    const ni = getNeighborAt(i);
    const n = getUnit(ni);
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
    let dmg = t.damage * vd;
    if (n.shieldLingerTimer > 0) dmg *= REFLECTOR_BEAM_SHIELD_MULTIPLIER;
    n.hp -= dmg;
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
      0,
    );
    if (n.hp <= 0) {
      killUnit(ni);
      explosion(n.x, n.y, n.team, n.type, ctx.ui, ctx.rng);
    }
  }
}

function sweepAfterimage(u: Unit, ox: number, oy: number, easeAt: (p: number) => number, c: Color3, range: number) {
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
      0,
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
      0,
    );
  }
}

function sweepGlowRing(ctx: CombatContext, x: number, y: number, c: Color3, dt: number) {
  if (ctx.rng() < 1 - 0.75 ** (dt * REF_FPS)) {
    spawnParticle(x, y, 0, 0, 0.1, 12 + ctx.rng() * 6, c[0], c[1], c[2], 10);
  }
}

function handleSweepBeam(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;

  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }

  if (u.sweepPhase === 0 && u.cooldown > 0) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }

  if (u.sweepPhase === 0) {
    u.sweepBaseAngle = Math.atan2(dy, dx);
    u.sweepPhase = 0.001;
    u.beamOn = 1;
    sweepHitMap.set(ctx.ui, new Set());
  }

  const prevPhase = u.sweepPhase;
  u.sweepPhase = Math.min(u.sweepPhase + dt / SWEEP_DURATION, 1);

  // smoothstep: +HALF_ARC → -HALF_ARC
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
    sweepHitMap.delete(ctx.ui);
  }
}

function handleFocusBeam(ctx: CombatContext) {
  const { u, ui, c, t, dt, vd } = ctx;
  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }

  u.beamOn = Math.min(u.beamOn + dt * 0.8, 2);

  if (u.cooldown <= 0) {
    u.cooldown = t.fireRate;
    let dmg = t.damage * u.beamOn * vd;
    if (o.shieldLingerTimer > 0) dmg *= REFLECTOR_BEAM_SHIELD_MULTIPLIER;
    o.hp -= dmg;
    knockback(u.target, u.x, u.y, dmg * 5);
    const pCount = 1 + Math.floor(u.beamOn * 2);
    const pSize = 2 + u.beamOn * 0.5;
    const pSpeed = 50 + u.beamOn * 25;
    for (let i = 0; i < pCount; i++) {
      spawnParticle(
        o.x + (ctx.rng() - 0.5) * 8,
        o.y + (ctx.rng() - 0.5) * 8,
        (ctx.rng() - 0.5) * pSpeed,
        (ctx.rng() - 0.5) * pSpeed,
        0.08,
        pSize,
        c[0],
        c[1],
        c[2],
        0,
      );
    }
    if (o.hp <= 0) {
      killUnit(u.target);
      explosion(o.x, o.y, o.team, o.type, ui, ctx.rng);
      u.beamOn = 0;
    }
  }

  const bw = 2 + u.beamOn * 2;
  const brightness = Math.min(1, 0.5 + u.beamOn * 0.25);
  addBeam(
    u.x + Math.cos(u.angle) * t.size * 0.5,
    u.y + Math.sin(u.angle) * t.size * 0.5,
    o.x,
    o.y,
    c[0] * brightness,
    c[1] * brightness,
    c[2] * brightness,
    0.08,
    bw,
  );
}

function swarmDmgMul(u: Unit): number {
  return 1 + u.swarmN * 0.15;
}

function fireBurst(ctx: CombatContext, ang: number, d: number, dmgMul = 1) {
  const { u, c, t, vd } = ctx;
  if (u.burstCount <= 0) u.burstCount = t.burst ?? 1;
  const sizeMul = 1 + (dmgMul - 1) * 0.5;
  const wb = (dmgMul - 1) * 0.4;
  const sp = 480 + t.damage * 12;
  spawnProjectile(
    u.x + Math.cos(u.angle) * t.size,
    u.y + Math.sin(u.angle) * t.size,
    Math.cos(ang) * sp + u.vx * 0.3,
    Math.sin(ang) * sp + u.vy * 0.3,
    d / sp + 0.1,
    t.damage * vd * dmgMul,
    u.team,
    (1.8 + t.damage * 0.25) * sizeMul,
    c[0] + (1 - c[0]) * wb,
    c[1] + (1 - c[1]) * wb,
    c[2] + (1 - c[2]) * wb,
  );
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
}

function fireHoming(ctx: CombatContext, ang: number, d: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(ang) * 280,
    Math.sin(ang) * 280,
    d / 280 + 1,
    t.damage * vd,
    u.team,
    2.5,
    c[0],
    c[1],
    c[2],
    true,
    0,
    u.target,
  );
}

function fireAoe(ctx: CombatContext, ang: number, d: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(ang) * 170,
    Math.sin(ang) * 170,
    d / 170 + 0.2,
    t.damage * vd,
    u.team,
    5,
    c[0] * 0.8,
    c[1] * 0.7 + 0.3,
    c[2],
    false,
    t.aoe,
  );
}

function fireFlagshipSpread(ctx: CombatContext, ang: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  for (let i = -2; i <= 2; i++) {
    const ba = ang + i * 0.25;
    spawnProjectile(
      u.x + Math.cos(ba) * t.size,
      u.y + Math.sin(ba) * t.size,
      Math.cos(ba) * 420,
      Math.sin(ba) * 420,
      t.range / 420 + 0.1,
      t.damage * vd,
      u.team,
      2,
      c[0],
      c[1],
      c[2],
    );
  }
}

function fireRailgun(ctx: CombatContext, ang: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x + Math.cos(ang) * t.size,
    u.y + Math.sin(ang) * t.size,
    Math.cos(ang) * 900,
    Math.sin(ang) * 900,
    t.range / 900 + 0.05,
    t.damage * vd,
    u.team,
    3,
    c[0] * 0.5 + 0.5,
    c[1] * 0.5 + 0.5,
    c[2] * 0.5 + 0.5,
  );
  addBeam(u.x, u.y, u.x + Math.cos(ang) * t.range, u.y + Math.sin(ang) * t.range, c[0], c[1], c[2], 0.1, 1.5);
  for (let i = 0; i < 4; i++) {
    const a2 = ang + (ctx.rng() - 0.5) * 0.4;
    spawnParticle(
      u.x + Math.cos(ang) * t.size * 1.5,
      u.y + Math.sin(ang) * t.size * 1.5,
      Math.cos(a2) * 160,
      Math.sin(a2) * 160,
      0.08,
      2.5,
      1,
      1,
      0.8,
      0,
    );
  }
}

function spawnMuzzleFlash(ctx: CombatContext, ang: number) {
  const { u, c, t } = ctx;
  const mx = u.x + Math.cos(u.angle) * t.size;
  const my = u.y + Math.sin(u.angle) * t.size;
  for (let i = 0; i < 3; i++) {
    spawnParticle(
      mx,
      my,
      Math.cos(ang) * (60 + ctx.rng() * 60) + (ctx.rng() - 0.5) * 35,
      Math.sin(ang) * (60 + ctx.rng() * 60) + (ctx.rng() - 0.5) * 35,
      0.06 + ctx.rng() * 0.03,
      2.5 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      0,
    );
  }
  spawnParticle(mx, my, 0, 0, 0.05, 3 + t.damage * 0.5, 1, 1, 1, 0);
}

function fireNormal(ctx: CombatContext) {
  const { u, t } = ctx;
  if (u.target === NO_UNIT) {
    u.burstCount = 0;
    return;
  }
  if (u.cooldown > 0) return;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.burstCount = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.burstCount = 0;
    return;
  }

  const ang = Math.atan2(dy, dx);

  if (t.burst) {
    fireBurst(ctx, ang, d);
    return;
  }

  if (t.homing) {
    fireHoming(ctx, ang, d);
  } else if (t.aoe) {
    fireAoe(ctx, ang, d);
  } else if (t.shape === 3) {
    fireFlagshipSpread(ctx, ang);
  } else if (t.shape === 8) {
    fireRailgun(ctx, ang);
  } else {
    const dmgMul = t.swarm ? swarmDmgMul(u) : 1;
    fireBurst(ctx, ang, d, dmgMul);
  }

  if (!t.homing && !t.aoe && t.shape !== 8) {
    spawnMuzzleFlash(ctx, ang);
  }
}

export function combat(u: Unit, ui: UnitIndex, dt: number, _now: number, rng: () => number) {
  const t = getUnitType(u.type);
  if (u.stun > 0) return;
  u.cooldown -= dt;
  u.abilityCooldown -= dt;
  const c = getColor(u.type, u.team);
  const vd = 1 + u.vet * 0.2;
  _ctx.u = u;
  _ctx.ui = ui;
  _ctx.dt = dt;
  _ctx.c = c;
  _ctx.vd = vd;
  _ctx.t = t;
  _ctx.rng = rng;

  if (t.rams) {
    handleRam(_ctx);
    return;
  }
  if (t.heals && u.abilityCooldown <= 0) handleHealer(_ctx);
  if (t.reflects) {
    handleReflector(_ctx);
    return;
  }
  if (t.spawns) handleCarrier(_ctx);
  if (t.emp && u.abilityCooldown <= 0) {
    handleEmp(_ctx);
    return;
  }
  if (t.teleports) handleTeleporter(_ctx);
  if (t.chain && u.cooldown <= 0) {
    handleChain(_ctx);
    return;
  }
  if (t.sweep) {
    handleSweepBeam(_ctx);
    return;
  }
  if (t.beam) {
    handleFocusBeam(_ctx);
    return;
  }
  fireNormal(_ctx);
}
