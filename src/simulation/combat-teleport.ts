import { SH_CIRCLE, SH_DIAMOND_RING, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools-query.ts';
import { NO_UNIT } from '../types.ts';
import { aimAt } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { getNeighbors, knockback } from './spatial-hash.ts';
import { spawnParticle, spawnProjectile } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';

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

function fireBlinkShots(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;
  if (u.target === NO_UNIT) {
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    return;
  }
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
      { sourceUnit: ctx.ui },
    );
  }
  u.angle = aim.ang;
}

function blinkArrive(ctx: CombatContext) {
  const { u, c } = ctx;

  u.blinkPhase = 0;

  for (let i = 0; i < 8; i++) {
    const a = ctx.rng() * 6.283;
    spawnParticle(u.x, u.y, Math.cos(a) * 90, Math.sin(a) * 90, 0.3, 3.5, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(u.x, u.y, 0, 0, 0.25, 16, c[0], c[1], c[2], SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.25, 10, c[0], c[1], c[2], SH_DIAMOND_RING);

  ctx.shake(1.2, u.x, u.y);

  const nb = getNeighbors(u.x, u.y, BLINK_IMPACT_RADIUS);
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i);
    const o = unit(oi);
    if (!o.alive || o.team === u.team) {
      continue;
    }
    knockback(oi, u.x, u.y, BLINK_IMPACT_KNOCKBACK);
    o.stun = Math.max(o.stun, BLINK_IMPACT_STUN);
  }

  fireBlinkShots(ctx);

  u.blinkCount--;
  u.teleportTimer = u.blinkCount > 0 ? BLINK_GAP : BLINK_CD_MIN + ctx.rng() * BLINK_CD_RNG;
  u.cooldown = Math.max(u.cooldown, BLINK_GAP + 0.05);
}

export function teleport(ctx: CombatContext): boolean {
  const { u, dt } = ctx;
  u.teleportTimer -= dt;
  if (u.teleportTimer > 0) {
    return false;
  }

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
