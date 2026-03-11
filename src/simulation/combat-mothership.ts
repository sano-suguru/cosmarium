import { SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Armament, Color3 } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import { aimAt } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

const DREADNOUGHT_PROJ_SPEED = 320;
const DREADNOUGHT_PROJ_SIZE = 7;
const DREADNOUGHT_AOE = 40;
const DREADNOUGHT_AIM_ACCURACY = 0.7;
const DREADNOUGHT_MUZZLE_OFFSET = 0.6;
const DREADNOUGHT_BEAM_LENGTH = 80;
const DREADNOUGHT_FLIGHT_MARGIN = 0.1;

function spawnMuzzleFlash(x: number, y: number, ang: number, c: Color3, rng: () => number): void {
  for (let j = 0; j < 3; j++) {
    const a = ang + (rng() - 0.5) * 0.4;
    spawnParticle(
      x,
      y,
      Math.cos(a) * (80 + rng() * 60),
      Math.sin(a) * (80 + rng() * 60),
      0.06 + rng() * 0.03,
      3 + rng() * 2,
      c[0] * 0.6 + 0.4,
      c[1] * 0.6 + 0.4,
      c[2] * 0.6 + 0.4,
      SH_CIRCLE,
    );
  }
}

function spawnFireBeam(x: number, y: number, cos: number, sin: number, c: Color3): void {
  addBeam(
    x,
    y,
    x + cos * DREADNOUGHT_BEAM_LENGTH,
    y + sin * DREADNOUGHT_BEAM_LENGTH,
    c[0] * 0.8,
    c[1] * 0.8,
    c[2] * 0.8,
    0.05,
    3.0,
    true,
    6,
  );
}

/**
 * Dreadnought 母艦の主砲射撃。
 * fireRate/damage/range は UnitType ではなくバリアント定義から取得する。
 * armament は呼び出し元で解決して渡す（依存注入パターン）。
 */
export function mothershipCombat(ctx: CombatContext, arm: Armament): void {
  const { u, ui, c, vd, rng } = ctx;
  const sz = unitType(u.type).size;

  if (u.cooldown > 0) {
    return;
  }
  if (u.target === NO_UNIT) {
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return;
  }

  const dx = o.x - u.x;
  const dy = o.y - u.y;
  if (dx * dx + dy * dy >= arm.range * arm.range) {
    return;
  }

  const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, DREADNOUGHT_PROJ_SPEED, DREADNOUGHT_AIM_ACCURACY);
  const cos = Math.cos(aim.ang);
  const sin = Math.sin(aim.ang);
  const muzzleX = u.x + cos * sz * DREADNOUGHT_MUZZLE_OFFSET;
  const muzzleY = u.y + sin * sz * DREADNOUGHT_MUZZLE_OFFSET;

  spawnProjectile(
    muzzleX,
    muzzleY,
    cos * DREADNOUGHT_PROJ_SPEED,
    sin * DREADNOUGHT_PROJ_SPEED,
    arm.range / DREADNOUGHT_PROJ_SPEED + DREADNOUGHT_FLIGHT_MARGIN,
    arm.damage * vd,
    u.team,
    DREADNOUGHT_PROJ_SIZE,
    c[0],
    c[1],
    c[2],
    { aoe: DREADNOUGHT_AOE, sourceUnit: ui },
  );

  spawnMuzzleFlash(muzzleX, muzzleY, aim.ang, c, rng);
  spawnFireBeam(muzzleX, muzzleY, cos, sin, c);
  spawnParticle(u.x, u.y, 0, 0, 0.08, sz * 0.3, 1, 1, 1, SH_EXPLOSION_RING);
  ctx.shake(2, u.x, u.y);

  u.cooldown = arm.fireRate;
}
