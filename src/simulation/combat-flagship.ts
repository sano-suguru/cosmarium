import { BEAM_DECAY_RATE, REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { unit } from '../pools.ts';
import { NO_UNIT } from '../types.ts';
import { FLAGSHIP_ENGINE_OFFSETS } from '../unit-types.ts';
import { aimAt } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

const FLAGSHIP_MAIN_GUN_SPEED = 380;
const FLAGSHIP_MAIN_SPREAD = 0.15;
const FLAGSHIP_CHARGE_TIME = 0.3;
const FLAGSHIP_BROADSIDE_DELAY = 0.15;
const BROADSIDE_IDLE = 0;
const BROADSIDE_AWAITING_SALVO = -1;
const MUZZLE_FWD = 0.65;

const _fwBuf: [number, number] = [0, 0];
function flagshipWorld(u: CombatContext['u'], forward: number, starboard: number): [number, number] {
  const cos = Math.cos(u.angle);
  const sin = Math.sin(u.angle);
  _fwBuf[0] = u.x + cos * forward - sin * starboard;
  _fwBuf[1] = u.y + sin * forward + cos * starboard;
  return _fwBuf;
}

function flagshipChargeVfx(ctx: CombatContext, progress: number) {
  const { u, c, t } = ctx;
  const glowSize = 8 + progress * 22;
  const br = 0.3 + progress * 0.7;
  if (ctx.rng() < 0.4) {
    spawnParticle(u.x, u.y, 0, 0, 0.08, glowSize, c[0] * br, c[1] * br, c[2] * br, SH_EXPLOSION_RING);
  }

  for (const sign of [-1, 1] as const) {
    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      if (ctx.rng() < progress * 0.6) {
        const [ex, eyy] = flagshipWorld(u, -t.size * 1.05, sign * ey * t.size);
        const speed = 90 + ctx.rng() * 70;
        spawnParticle(
          ex,
          eyy,
          ((u.x - ex) / t.size) * speed,
          ((u.y - eyy) / t.size) * speed,
          0.1 + ctx.rng() * 0.05,
          1.5 + ctx.rng() * 2,
          c[0] * 0.7 + 0.3,
          c[1] * 0.7 + 0.3,
          c[2] * 0.7 + 0.3,
          SH_CIRCLE,
        );
      }
    }
  }

  addShake(0.4 * progress * ctx.dt * REF_FPS, u.x, u.y);
}

function flagshipPreviewBeam(ctx: CombatContext, lockAngle: number, progress: number) {
  const { u, c, t } = ctx;
  const dx = Math.cos(lockAngle);
  const dy = Math.sin(lockAngle);
  const beamLen = t.range * 0.5;
  const w = 1.0 + 2.5 * progress;
  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * beamLen, my + dy * beamLen, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.05, w, true, 8);
  }
  if (progress > 0.3) {
    const [lx, ly] = flagshipWorld(u, t.size * 0.2, 0.24 * t.size);
    const [rx, ry] = flagshipWorld(u, t.size * 0.2, -0.24 * t.size);
    addBeam(lx, ly, rx, ry, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.04, 0.5 + 1.5 * progress, false, 6, true);
  }
}

function flagshipFireMain(ctx: CombatContext, lockAngle: number) {
  const { u, c, t, vd } = ctx;
  const sp = FLAGSHIP_MAIN_GUN_SPEED;
  const dx = Math.cos(lockAngle);
  const dy = Math.sin(lockAngle);

  /** 固定照準の散布角 — スウォーム相手に意図的に弱い */
  for (let i = -1; i <= 1; i++) {
    const ba = lockAngle + i * FLAGSHIP_MAIN_SPREAD;
    const hullSign = i >= 0 ? 1 : -1;
    const [ox, oy] = flagshipWorld(u, t.size * MUZZLE_FWD, hullSign * 0.24 * t.size);
    spawnProjectile(
      ox,
      oy,
      Math.cos(ba) * sp,
      Math.sin(ba) * sp,
      t.range / sp + 0.1,
      t.damage * vd,
      u.team,
      7,
      c[0],
      c[1],
      c[2],
      false,
      60,
    );
    for (let j = 0; j < 5; j++) {
      const a = ba + (ctx.rng() - 0.5) * 0.5;
      spawnParticle(
        ox,
        oy,
        Math.cos(a) * (90 + ctx.rng() * 100),
        Math.sin(a) * (90 + ctx.rng() * 100),
        0.07 + ctx.rng() * 0.04,
        3 + ctx.rng() * 3,
        c[0] * 0.5 + 0.5,
        c[1] * 0.5 + 0.5,
        c[2] * 0.5 + 0.5,
        SH_CIRCLE,
      );
    }
  }

  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * 100, my + dy * 100, 0.95, 0.95, 1.0, 0.04, 5.5, true, 4, true);
  }

  const backX = -Math.cos(u.angle);
  const backY = -Math.sin(u.angle);
  for (const sign of [-1, 1] as const) {
    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      const [ex, eyy] = flagshipWorld(u, -t.size * 1.05, sign * ey * t.size);
      for (let j = 0; j < 2; j++) {
        spawnParticle(
          ex,
          eyy,
          backX * (120 + ctx.rng() * 80) + (ctx.rng() - 0.5) * 40,
          backY * (120 + ctx.rng() * 80) + (ctx.rng() - 0.5) * 40,
          0.06 + ctx.rng() * 0.04,
          2 + ctx.rng() * 2,
          c[0] * 0.6 + 0.4,
          c[1] * 0.6 + 0.4,
          c[2] * 0.6 + 0.4,
          SH_CIRCLE,
        );
      }
    }
  }

  spawnParticle(u.x, u.y, 0, 0, 0.1, t.size * 0.8, 1, 1, 1, SH_EXPLOSION_RING);
  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * 240, my + dy * 240, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.06, 2.5, true, 8);
  }

  addShake(6, u.x, u.y);
}

function flagshipFireBroadside(ctx: CombatContext, lockAngle: number) {
  const { u, c, t, vd } = ctx;
  const sp = 350;
  const perpDmg = Math.ceil(t.damage * 0.6 * vd);

  for (const side of [-1, 1] as const) {
    const ba = lockAngle + side * (Math.PI / 2);
    const baDx = Math.cos(ba);
    const baDy = Math.sin(ba);
    const [ox, oy] = flagshipWorld(u, 0, side * 0.24 * t.size);
    spawnProjectile(
      ox,
      oy,
      baDx * sp,
      baDy * sp,
      (t.range * 0.7) / sp + 0.1,
      perpDmg,
      u.team,
      5,
      c[0] * 0.8,
      c[1] * 0.8,
      c[2] * 0.8,
    );

    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      const [bx, by] = flagshipWorld(u, -t.size * 0.3, side * ey * t.size);
      addBeam(bx, by, bx + baDx * 70, by + baDy * 70, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.04, 2.0, true, 6);
    }

    for (let j = 0; j < 4; j++) {
      const a = ba + (ctx.rng() - 0.5) * 0.4;
      spawnParticle(
        ox,
        oy,
        Math.cos(a) * (70 + ctx.rng() * 70),
        Math.sin(a) * (70 + ctx.rng() * 70),
        0.06 + ctx.rng() * 0.03,
        2 + ctx.rng() * 2,
        c[0],
        c[1],
        c[2],
        SH_CIRCLE,
      );
    }

    addBeam(ox, oy, ox + baDx * t.range * 0.5, oy + baDy * t.range * 0.5, c[0], c[1], c[2], 0.06, 4.0, true, 6);
  }

  addShake(4, u.x, u.y);
}

/**
 * State machine reusing existing Unit fields:
 *   beamOn: charge progress (0=idle, 0→1=charging, 1=charged)
 *   sweepBaseAngle: locked target angle at charge start
 *   broadsidePhase: phase (BROADSIDE_IDLE=0, BROADSIDE_AWAITING_SALVO=-1)
 */
export function flagshipBarrage(ctx: CombatContext) {
  const { u, t, dt } = ctx;

  if (u.target === NO_UNIT) {
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_IDLE;
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_IDLE;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= ctx.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    u.broadsidePhase = BROADSIDE_IDLE;
    return;
  }

  if (u.beamOn === 0 && u.cooldown > 0) return;

  if (u.beamOn === 0) {
    const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, FLAGSHIP_MAIN_GUN_SPEED, t.leadAccuracy);
    u.sweepBaseAngle = aim.ang;
    u.beamOn = 0.001;
    u.broadsidePhase = BROADSIDE_IDLE;
  }

  if (u.broadsidePhase === BROADSIDE_IDLE) {
    u.beamOn = Math.min(u.beamOn + dt / FLAGSHIP_CHARGE_TIME, 1);
    flagshipChargeVfx(ctx, u.beamOn);
    flagshipPreviewBeam(ctx, u.sweepBaseAngle, u.beamOn);

    if (u.beamOn >= 1) {
      flagshipFireMain(ctx, u.sweepBaseAngle);
      u.broadsidePhase = BROADSIDE_AWAITING_SALVO;
      u.beamOn = 1;
      u.cooldown = FLAGSHIP_BROADSIDE_DELAY;
      return;
    }
    return;
  }

  if (u.broadsidePhase === BROADSIDE_AWAITING_SALVO && u.cooldown <= 0) {
    flagshipFireBroadside(ctx, u.sweepBaseAngle);
    u.cooldown = t.fireRate;
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_IDLE;
  }
}
