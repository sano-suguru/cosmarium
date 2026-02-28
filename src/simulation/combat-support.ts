import { REF_FPS, SH_CIRCLE, SH_DIAMOND, SH_DIAMOND_RING } from '../constants.ts';
import type { CombatContext } from './combat-context.ts';
import { spawnParticle } from './spawn.ts';

export const AMP_DAMAGE_MULT = 1.2;
export const SCRAMBLE_COOLDOWN_MULT = 1 / 1.35;
export const CATALYST_COOLDOWN_MULT = 1.25;

function spawnAuraParticle(ctx: CombatContext, r0: number, g0: number, b0: number, shape: number) {
  const { u, c, dt } = ctx;
  if (ctx.rng() < 1 - 0.6 ** (dt * REF_FPS)) {
    const a = ctx.rng() * Math.PI * 2;
    const r = u.mass * 3.5;
    spawnParticle(
      u.x + Math.cos(a) * r,
      u.y + Math.sin(a) * r,
      Math.cos(a) * 25,
      Math.sin(a) * 25,
      0.5,
      4,
      c[0] * r0,
      c[1] * g0,
      c[2] * b0,
      shape,
    );
  }
}

export function shieldAllies(ctx: CombatContext) {
  spawnAuraParticle(ctx, 0.6, 0.6, 0.8, SH_DIAMOND_RING);
}

export function amplifyAllies(ctx: CombatContext) {
  spawnAuraParticle(ctx, 0.8, 0.5, 0.2, SH_DIAMOND);
}

export function catalyzeAllies(ctx: CombatContext) {
  const { u, c, dt } = ctx;
  spawnAuraParticle(ctx, 0.3, 0.9, 0.4, SH_DIAMOND);
  const streakProb = 1 - 0.7 ** (dt * REF_FPS);
  for (let k = 0; k < 2; k++) {
    if (ctx.rng() < streakProb) {
      const ang = u.angle + (ctx.rng() - 0.5) * 1.2;
      const off = u.mass * (1.5 + ctx.rng());
      spawnParticle(
        u.x + Math.cos(ang) * off,
        u.y + Math.sin(ang) * off,
        Math.cos(ang) * 30,
        Math.sin(ang) * 30,
        0.25,
        2.5 + ctx.rng() * 2,
        c[0] * 0.2,
        c[1] * 0.85,
        c[2] * 0.45,
        SH_CIRCLE,
      );
    }
  }
}

export function scrambleEnemies(ctx: CombatContext) {
  const { u, c, dt } = ctx;
  spawnAuraParticle(ctx, 0.7, 0.2, 0.5, SH_DIAMOND);
  if (ctx.rng() < 1 - 0.85 ** (dt * REF_FPS)) {
    spawnParticle(u.x, u.y, 0, 0, 0.25, 10, c[0] * 0.7, c[1] * 0.2, c[2] * 0.5, SH_DIAMOND_RING);
  }
  if (ctx.rng() < 1 - 0.75 ** (dt * REF_FPS)) {
    const a2 = ctx.rng() * Math.PI * 2;
    const r2 = u.mass * 2.0;
    spawnParticle(
      u.x + Math.cos(a2) * r2,
      u.y + Math.sin(a2) * r2,
      Math.cos(a2) * 12,
      Math.sin(a2) * 12,
      0.35,
      3,
      c[0] * 0.5,
      c[1] * 0.1,
      c[2] * 0.7,
      SH_CIRCLE,
    );
  }
}
