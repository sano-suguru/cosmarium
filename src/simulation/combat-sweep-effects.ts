import { REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import type { CombatContext } from './combat-context.ts';
import { spawnParticle } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';

const AFTERIMAGE_TRAILS: readonly (readonly [number, number, number, number])[] = [
  [0.08, 0.35, 4, 0.1],
  [0.18, 0.15, 2.5, 0.12],
] as const;

export function sweepAfterimage(ctx: CombatContext, ox: number, oy: number, easeAt: (p: number) => number) {
  const { u, c, t } = ctx;
  for (const [phaseOffset, colorMul, width, opacity] of AFTERIMAGE_TRAILS) {
    if (u.sweepPhase > phaseOffset) {
      const angle = u.sweepBaseAngle + easeAt(u.sweepPhase - phaseOffset);
      addBeam(
        ox,
        oy,
        u.x + Math.cos(angle) * t.attackRange,
        u.y + Math.sin(angle) * t.attackRange,
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

export function sweepTipSpark(ctx: CombatContext, x: number, y: number) {
  if (ctx.rng() < 1 - 0.45 ** (ctx.dt * REF_FPS)) {
    const a = ctx.rng() * Math.PI * 2;
    const s = 40 + ctx.rng() * 100;
    spawnParticle(
      x,
      y,
      Math.cos(a) * s,
      Math.sin(a) * s,
      0.12 + ctx.rng() * 0.1,
      3 + ctx.rng() * 2,
      ctx.c[0],
      ctx.c[1],
      ctx.c[2],
      SH_CIRCLE,
    );
  }
}

export function sweepPathParticles(
  ctx: CombatContext,
  ox: number,
  oy: number,
  endX: number,
  endY: number,
  beamAngle: number,
) {
  if (ctx.rng() < 1 - 0.7 ** (ctx.dt * REF_FPS)) {
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
      ctx.c[0],
      ctx.c[1],
      ctx.c[2],
      SH_CIRCLE,
    );
  }
}

export function sweepGlowRing(ctx: CombatContext, x: number, y: number) {
  if (ctx.rng() < 1 - 0.75 ** (ctx.dt * REF_FPS)) {
    spawnParticle(x, y, 0, 0, 0.1, 12 + ctx.rng() * 6, ctx.c[0], ctx.c[1], ctx.c[2], SH_EXPLOSION_RING);
  }
}
