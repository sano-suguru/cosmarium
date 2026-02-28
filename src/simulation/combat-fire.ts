import { SH_CIRCLE } from '../constants.ts';
import { unit } from '../pools.ts';
import { NO_UNIT } from '../types.ts';
import { aimAt, swarmDmgMul } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { fireRailgun, RAILGUN_SHAPE } from './combat-railgun.ts';
import { spawnParticle, spawnProjectile } from './spawn.ts';

export const BURST_INTERVAL = 0.07;

const AMP_ACCURACY_MULT = 1.4;
const SCRAMBLE_ACCURACY_MULT = 0.5;
const AOE_PROJ_SPEED = 170;
const AOE_PROJ_SIZE = 5;
const HOMING_SPREAD = 0.15;
const HOMING_SPEED = 280;
const CARPET_SPREAD = 0.2;

const DEFAULT_CANNON_OFFSET: readonly [number, number] = [0.8, 0.7];
const SALVO_SIGNS: readonly (-1 | 1)[] = [-1, 1];

const _cwBuf: [number, number] = [0, 0];
function cannonWorld(u: CombatContext['u'], localX: number, localY: number): void {
  const cos = Math.cos(u.angle);
  const sin = Math.sin(u.angle);
  _cwBuf[0] = u.x + cos * localX - sin * localY;
  _cwBuf[1] = u.y + sin * localX + cos * localY;
}

function flashParticle(ctx: CombatContext, ang: number, mx: number, my: number) {
  const { c } = ctx;
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
    SH_CIRCLE,
  );
}

function spawnCannonFlash(ctx: CombatContext, ang: number, mx: number, my: number) {
  flashParticle(ctx, ang, mx, my);
  spawnParticle(mx, my, 0, 0, 0.05, 2.5, 1, 1, 1, SH_CIRCLE);
}

function spawnMuzzleFlash(ctx: CombatContext, ang: number) {
  const { u, t } = ctx;
  const mx = u.x + Math.cos(u.angle) * t.size;
  const my = u.y + Math.sin(u.angle) * t.size;
  for (let i = 0; i < 3; i++) {
    flashParticle(ctx, ang, mx, my);
  }
  spawnParticle(mx, my, 0, 0, 0.05, 3 + t.damage * 0.5, 1, 1, 1, SH_CIRCLE);
}

function fireShot(ctx: CombatContext, ang: number, d: number, sp: number, dmgMul = 1, burstIdx = 0) {
  const { u, c, t, vd } = ctx;
  const sizeMul = 1 + (dmgMul - 1) * 0.5;
  const wb = (dmgMul - 1) * 0.4;
  const vxInherit = u.vx * 0.3;
  const vyInherit = u.vy * 0.3;
  const life = d / sp + 0.1;
  const dmg = t.damage * vd * dmgMul;
  const pSize = (1.8 + t.damage * 0.25) * sizeMul;
  const pr = c[0] + (1 - c[0]) * wb;
  const pg = c[1] + (1 - c[1]) * wb;
  const pb = c[2] + (1 - c[2]) * wb;
  const salvo = t.salvo;
  if (salvo >= 2) {
    const offsets = t.cannonOffsets;
    const idx = offsets ? burstIdx % offsets.length : 0;
    const pair = offsets?.[idx] ?? DEFAULT_CANNON_OFFSET;
    const ox = pair[0];
    const oy = pair[1];
    const localX = ox * t.size;
    const localY = oy * t.size;
    const vxP = Math.cos(ang) * sp + vxInherit;
    const vyP = Math.sin(ang) * sp + vyInherit;
    for (const sign of SALVO_SIGNS) {
      cannonWorld(u, localX, localY * sign);
      const mx = _cwBuf[0];
      const my = _cwBuf[1];
      spawnProjectile(mx, my, vxP, vyP, life, dmg, u.team, pSize, pr, pg, pb);
      spawnCannonFlash(ctx, ang, mx, my);
    }
  } else {
    spawnProjectile(
      u.x + Math.cos(u.angle) * t.size,
      u.y + Math.sin(u.angle) * t.size,
      Math.cos(ang) * sp + vxInherit,
      Math.sin(ang) * sp + vyInherit,
      life,
      dmg,
      u.team,
      pSize,
      pr,
      pg,
      pb,
    );
    spawnMuzzleFlash(ctx, ang);
  }
}

function fireBurst(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, t } = ctx;
  const shots = t.shots;
  if (u.burstCount <= 0) u.burstCount = shots;
  fireShot(ctx, ang, d, sp, 1, shots - u.burstCount);
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
}

function fireHomingBurst(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, c, t, vd } = ctx;
  const shots = t.shots;
  if (u.burstCount <= 0) u.burstCount = shots;
  const burstIdx = shots - u.burstCount;
  const spreadAng = ang + (burstIdx - (shots - 1) / 2) * HOMING_SPREAD;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(spreadAng) * sp,
    Math.sin(spreadAng) * sp,
    d / sp + 1,
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
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
  spawnMuzzleFlash(ctx, ang);
}

function fireAoe(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(ang) * sp,
    Math.sin(ang) * sp,
    d / sp + 0.2,
    t.damage * vd,
    u.team,
    AOE_PROJ_SIZE,
    c[0] * 0.8,
    c[1] * 0.7 + 0.3,
    c[2],
    false,
    t.aoe,
  );
  spawnMuzzleFlash(ctx, ang);
}

function fireCarpetBomb(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, t } = ctx;
  const shots = t.shots;
  if (u.burstCount <= 0) u.burstCount = shots;
  const burstIdx = shots - u.burstCount;
  const spreadAng = ang + (burstIdx - (shots - 1) / 2) * CARPET_SPREAD;
  fireAoe(ctx, spreadAng, d, sp);
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
}

/** 射撃モード分岐 + 弾速決定 + 偏差射撃。COMBAT_FLAG_PRIORITY の末尾と一致させること */
function dispatchFire(ctx: CombatContext, o: CombatContext['u']) {
  const { u, t } = ctx;

  if (t.shape === RAILGUN_SHAPE) {
    const directAng = Math.atan2(o.y - u.y, o.x - u.x);
    fireRailgun(ctx, directAng);
    return;
  }
  let sp: number;
  if (t.carpet) sp = AOE_PROJ_SPEED;
  else if (t.homing) sp = HOMING_SPEED;
  else if (t.aoe) sp = AOE_PROJ_SPEED;
  else sp = 480 + t.damage * 12;
  const ampAcc = u.ampBoostTimer > 0 ? AMP_ACCURACY_MULT : 1;
  const scrAcc = u.scrambleTimer > 0 ? SCRAMBLE_ACCURACY_MULT : 1;
  const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, sp, Math.min(1, t.leadAccuracy * ampAcc * scrAcc));
  if (t.carpet) {
    fireCarpetBomb(ctx, aim.ang, aim.dist, sp);
    return;
  }
  if (t.homing) {
    fireHomingBurst(ctx, aim.ang, aim.dist, sp);
    return;
  }
  if (t.shots > 1) {
    fireBurst(ctx, aim.ang, aim.dist, sp);
    return;
  }
  if (t.aoe) {
    fireAoe(ctx, aim.ang, aim.dist, sp);
  } else {
    const dmgMul = t.swarm ? swarmDmgMul(u) : 1;
    fireShot(ctx, aim.ang, aim.dist, sp, dmgMul);
    u.cooldown = t.fireRate;
  }
}

export function fireNormal(ctx: CombatContext) {
  const { u } = ctx;
  if (u.target === NO_UNIT) {
    u.burstCount = 0;
    return;
  }
  if (u.cooldown > 0) return;
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.burstCount = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= ctx.range) {
    u.burstCount = 0;
    return;
  }

  dispatchFire(ctx, o);
}
