import { SH_CIRCLE, SH_DIAMOND_RING, SH_EXPLOSION_RING } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { unit } from '../pools.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { aimAt, tgtDistOrClear } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { chainLightning, destroyMutualKill, destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, captureKiller, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

export const HEALER_AMOUNT = 3;
export const HEALER_COOLDOWN = 0.35;

const BLINK_COUNT = 3;
const WARP_DELAY = 0.25;
const BLINK_GAP = 0.09;
const BLINK_SHOTS = 2;
const BLINK_DIST_MIN = 100;
const BLINK_DIST_MAX = 220;
const BLINK_CD_MIN = 2.5;
const BLINK_CD_RNG = 1.5;
const BLINK_SHOT_SPEED = 520;
const BLINK_ACCURACY = 0.7;
const BLINK_SHOT_SPREAD = 0.04;
const BLINK_IMPACT_RADIUS = 80;
const BLINK_IMPACT_KNOCKBACK = 200;
const BLINK_IMPACT_STUN = 0.25;

export function ramTarget(ctx: CombatContext) {
  const { u, ui, t, vd } = ctx;
  const nn = getNeighbors(u.x, u.y, t.size * 2);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    const oType = unitType(o.type);
    if (!o.alive || o.team === u.team) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= t.size + oType.size) continue;
    o.hp -= Math.ceil(u.mass * 3 * vd);
    o.hitFlash = 1;
    knockback(oi, u.x, u.y, u.mass * 55);
    u.hp -= Math.ceil(oType.mass);
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
        SH_CIRCLE,
      );
    }
    if (o.hp <= 0 && u.hp <= 0) {
      destroyMutualKill(ui, oi, true, true, ctx.rng, KILL_CONTEXT.Ram);
      return;
    }
    if (o.hp <= 0) {
      destroyUnit(oi, ui, ctx.rng, KILL_CONTEXT.Ram);
    }
    if (u.hp <= 0) {
      destroyUnit(ui, oi, ctx.rng, KILL_CONTEXT.Ram);
      return;
    }
  }
}

export function healAllies(ctx: CombatContext) {
  const { u, ui } = ctx;
  u.abilityCooldown = HEALER_COOLDOWN;
  const nn = getNeighbors(u.x, u.y, 160);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === ui) continue;
    if (o.hp < o.maxHp) {
      o.hp = Math.min(o.maxHp, o.hp + HEALER_AMOUNT);
      addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
    }
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, SH_EXPLOSION_RING);
}

export function launchDrones(ctx: CombatContext) {
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
        SH_CIRCLE,
      );
    }
  }
}

export function dischargeEmp(ctx: CombatContext) {
  const { u, t } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0 || d >= t.range) return;
  u.abilityCooldown = t.fireRate;
  const nn = getNeighbors(u.x, u.y, t.range);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      oo = unit(oi);
    if (!oo.alive || oo.team === u.team) continue;
    if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) < t.range * t.range) {
      oo.stun = 1.5;
      oo.hp -= t.damage;
      oo.hitFlash = 1;
      if (oo.hp <= 0) {
        destroyUnit(oi, ctx.ui, ctx.rng, KILL_CONTEXT.Beam);
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
      SH_CIRCLE,
    );
  }
  spawnParticle(u.x, u.y, 0, 0, 0.45, t.range * 0.7, 0.4, 0.4, 1, SH_EXPLOSION_RING);
}

/** @pre u.target !== NO_UNIT && unit(u.target).alive — 呼び出し元で検証済み */
function blinkDepart(ctx: CombatContext) {
  const { u, c } = ctx;
  const o = unit(u.target);

  const prevX = u.x;
  const prevY = u.y;

  for (let i = 0; i < 6; i++) {
    const a = ctx.rng() * 6.283;
    spawnParticle(u.x, u.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.25, 3, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 12, c[0], c[1], c[2], SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.25, 8, c[0], c[1], c[2], SH_DIAMOND_RING);

  const baseAng = Math.atan2(o.y - prevY, o.x - prevX);
  const zigzag = baseAng + (2.094 + ctx.rng() * 2.094);
  const dist = BLINK_DIST_MIN + ctx.rng() * (BLINK_DIST_MAX - BLINK_DIST_MIN);
  u.x = o.x + Math.cos(zigzag) * dist;
  u.y = o.y + Math.sin(zigzag) * dist;

  addBeam(prevX, prevY, u.x, u.y, c[0], c[1], c[2], 0.28, 3, true);

  u.angle = Math.atan2(o.y - u.y, o.x - u.x);

  u.blinkPhase = 1;
}

function blinkArrive(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;

  u.blinkPhase = 0;

  for (let i = 0; i < 8; i++) {
    const a = ctx.rng() * 6.283;
    spawnParticle(u.x, u.y, Math.cos(a) * 90, Math.sin(a) * 90, 0.3, 3.5, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(u.x, u.y, 0, 0, 0.25, 16, c[0], c[1], c[2], SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.25, 10, c[0], c[1], c[2], SH_DIAMOND_RING);

  addShake(1.2, u.x, u.y);

  const nn = getNeighbors(u.x, u.y, BLINK_IMPACT_RADIUS);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i);
    const o = unit(oi);
    if (!o.alive || o.team === u.team) continue;
    knockback(oi, u.x, u.y, BLINK_IMPACT_KNOCKBACK);
    o.stun = Math.max(o.stun, BLINK_IMPACT_STUN);
  }

  if (u.target !== NO_UNIT) {
    const o = unit(u.target);
    if (o.alive) {
      const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, BLINK_SHOT_SPEED, BLINK_ACCURACY);
      for (let i = 0; i < BLINK_SHOTS; i++) {
        const spread = (ctx.rng() - 0.5) * BLINK_SHOT_SPREAD * 2;
        const shotAng = aim.ang + spread;
        spawnProjectile(
          u.x,
          u.y,
          Math.cos(shotAng) * BLINK_SHOT_SPEED,
          Math.sin(shotAng) * BLINK_SHOT_SPEED,
          aim.dist / BLINK_SHOT_SPEED + 0.1,
          t.damage * vd,
          u.team,
          2,
          c[0],
          c[1],
          c[2],
          false,
          0,
          undefined,
          ctx.ui,
        );
      }
      u.angle = aim.ang;
    }
  }

  u.blinkCount--;
  u.teleportTimer = u.blinkCount > 0 ? BLINK_GAP : BLINK_CD_MIN + ctx.rng() * BLINK_CD_RNG;
  u.cooldown = Math.max(u.cooldown, BLINK_GAP + 0.05);
}

export function teleport(ctx: CombatContext): boolean {
  const { u, dt } = ctx;
  u.teleportTimer -= dt;
  if (u.teleportTimer > 0) return false;

  if (u.blinkPhase === 1) {
    blinkArrive(ctx);
    return true;
  }

  if (u.target === NO_UNIT) {
    u.blinkCount = 0;
    return false;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.blinkCount = 0;
    return false;
  }

  if (u.blinkCount > 0) {
    blinkDepart(ctx);
    u.teleportTimer = WARP_DELAY;
    u.cooldown = Math.max(u.cooldown, WARP_DELAY + 0.05);
    return true;
  }

  const dx = o.x - u.x;
  const dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 80 && d < 600) {
    u.blinkCount = BLINK_COUNT;
    blinkDepart(ctx);
    u.teleportTimer = WARP_DELAY;
    u.cooldown = Math.max(u.cooldown, WARP_DELAY + 0.05);
    return true;
  }
  return false;
}

export function castChain(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0) return;
  if (d < ctx.range) {
    u.cooldown = t.fireRate;
    const killer = captureKiller(ctx.ui);
    if (!killer) return;
    chainLightning(u.x, u.y, u.team, t.damage * vd, 5, c, killer, ctx.rng);
    spawnParticle(u.x, u.y, 0, 0, 0.15, t.size, c[0], c[1], c[2], SH_EXPLOSION_RING);
  }
}
