import { BEAM_DECAY_RATE, SH_CIRCLE } from '../constants.ts';
import { unit } from '../pools.ts';
import { NO_UNIT } from '../types.ts';
import { applyBeamDefenses } from './combat-beam-defense.ts';
import type { CombatContext } from './combat-context.ts';
import { destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { knockback } from './spatial-hash.ts';
import { addBeam, spawnParticle } from './spawn.ts';

export function focusBeam(ctx: CombatContext) {
  const { u, ui, c, t, dt, vd } = ctx;
  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= ctx.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * BEAM_DECAY_RATE);
    return;
  }

  u.beamOn = Math.min(u.beamOn + dt * 0.8, 2);

  if (u.cooldown <= 0) {
    u.cooldown = t.fireRate;
    const dmg = applyBeamDefenses(o, u.target, t.damage * u.beamOn * vd, ctx.rng, ui);
    if (!u.alive) return;
    if (dmg >= 0) {
      o.hp -= dmg;
      o.hitFlash = 1;
      knockback(u.target, u.x, u.y, dmg * 5);
    }
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
        SH_CIRCLE,
      );
    }
    if (o.hp <= 0) {
      destroyUnit(u.target, ui, ctx.rng, KILL_CONTEXT.Beam);
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
