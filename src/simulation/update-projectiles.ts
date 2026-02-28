import { effectColor } from '../colors.ts';
import { PI, POOL_PROJECTILES, REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING, TAU } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import type { Color3, Projectile, ProjectileIndex, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { absorbByBastionShield, applyTetherAbsorb, ORPHAN_TETHER_PROJECTILE_MULT } from './combat-beam-defense.ts';
import { reflectProjectile } from './combat-reflect.ts';
import { destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { killProjectile, spawnParticle } from './spawn.ts';

function steerHomingProjectile(p: Projectile, dt: number) {
  const tg = unit(p.target);
  if (tg.alive) {
    let ca = Math.atan2(p.vy, p.vx);
    const da = Math.atan2(tg.y - p.y, tg.x - p.x);
    let diff = da - ca;
    if (diff > PI) diff -= TAU;
    if (diff < -PI) diff += TAU;
    ca += diff * 4 * dt;
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.vx = Math.cos(ca) * sp;
    p.vy = Math.sin(ca) * sp;
  }
}

function detonateAoe(p: Projectile, rng: () => number, skipUnit?: UnitIndex) {
  const nn = getNeighbors(p.x, p.y, p.aoe);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = unit(oi);
    if (!o.alive || o.team === p.team) continue;
    if (skipUnit !== undefined && oi === skipUnit) continue;
    const ddx = o.x - p.x,
      ddy = o.y - p.y;
    if (ddx * ddx + ddy * ddy < p.aoe * p.aoe) {
      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
      o.hp -= p.damage * (1 - dd / (p.aoe * 1.2));
      o.hitFlash = 1;
      knockback(oi, p.x, p.y, 220);
      if (o.hp <= 0) {
        destroyUnit(oi, p.sourceUnit, rng, KILL_CONTEXT.ProjectileAoe);
      }
    }
  }
  for (let j = 0; j < 16; j++) {
    const a = rng() * 6.283;
    spawnParticle(
      p.x,
      p.y,
      Math.cos(a) * (40 + rng() * 110),
      Math.sin(a) * (40 + rng() * 110),
      0.3 + rng() * 0.3,
      3 + rng() * 3,
      p.r,
      p.g * 0.8 + 0.2,
      p.b * 0.3,
      SH_CIRCLE,
    );
  }
  spawnParticle(p.x, p.y, 0, 0, 0.4, p.aoe * 0.9, p.r, p.g * 0.7 + 0.3, p.b * 0.2, SH_EXPLOSION_RING);
  addShake(3, p.x, p.y);
}

function killByProjectile(oi: UnitIndex, sourceUnit: UnitIndex, rng: () => number) {
  destroyUnit(oi, sourceUnit, rng, KILL_CONTEXT.ProjectileDirect);
}
function tryReflectField(p: Projectile, o: Unit, rng: () => number): boolean {
  if (o.reflectFieldHp <= 0) return false;
  o.reflectFieldHp -= p.damage;
  if (o.reflectFieldHp <= 0) {
    o.reflectFieldHp = 0;
  }
  const c: Color3 = effectColor(o.type, o.team);
  reflectProjectile(rng, o.x, o.y, p, o.team, c);
  return true;
}

function hitSparkFx(p: Projectile, rng: () => number) {
  const pAng = Math.atan2(p.vy, p.vx);
  for (let k = 0; k < 2; k++) {
    const sA = pAng + (rng() - 0.5) * 1.4;
    const sSpd = 60 + rng() * 100;
    spawnParticle(
      p.x,
      p.y,
      Math.cos(sA) * sSpd,
      Math.sin(sA) * sSpd,
      0.05 + rng() * 0.03,
      1.5 + rng(),
      1,
      1,
      0.7,
      SH_CIRCLE,
    );
  }
}

function applyProjectileDamage(p: Projectile, oi: UnitIndex, o: Unit, rng: () => number) {
  if (tryReflectField(p, o, rng)) return;
  let dmg = applyTetherAbsorb(o, p.damage, ORPHAN_TETHER_PROJECTILE_MULT, p.sourceUnit, rng);
  dmg = absorbByBastionShield(o, dmg);
  o.hp -= dmg;
  o.hitFlash = 1;
  knockback(oi, p.x, p.y, p.damage * 12);
  hitSparkFx(p, rng);
  spawnParticle(p.x, p.y, 0, 0, 0.08, p.size * 2.5, 1, 1, 1, SH_CIRCLE);
  spawnParticle(p.x, p.y, 0, 0, 0.12, p.size * 4, p.r, p.g, p.b, SH_EXPLOSION_RING);
  if (o.hp <= 0) killByProjectile(oi, p.sourceUnit, rng);
}

function detectProjectileHit(p: Projectile, pi: ProjectileIndex, rng: () => number): boolean {
  const nn = getNeighbors(p.x, p.y, 30);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = unit(oi);
    if (!o.alive || o.team === p.team) continue;
    const hs = unitType(o.type).size;
    if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) >= hs * hs) continue;
    applyProjectileDamage(p, oi, o, rng);
    if (p.aoe > 0) {
      detonateAoe(p, rng, oi);
    }
    killProjectile(pi);
    return true;
  }
  return false;
}

function projectileTrail(p: Projectile, dt: number, rng: () => number) {
  if (p.homing) {
    const prob = 1 - 0.35 ** (dt * REF_FPS);
    if (rng() < prob) {
      spawnParticle(p.x, p.y, (rng() - 0.5) * 12, (rng() - 0.5) * 12, 0.3, 3.0, 0.5, 0.5, 0.5, SH_CIRCLE);
    }
    if (rng() < prob) {
      spawnParticle(
        p.x,
        p.y,
        (rng() - 0.5) * 8,
        (rng() - 0.5) * 8,
        0.15,
        p.size * 1.2,
        Math.min(1, p.r * 1.4),
        Math.min(1, p.g * 1.4),
        Math.min(1, p.b * 1.4),
        SH_CIRCLE,
      );
    }
  } else if (rng() < 1 - 0.65 ** (dt * REF_FPS)) {
    spawnParticle(
      p.x,
      p.y,
      (rng() - 0.5) * 10,
      (rng() - 0.5) * 10,
      0.04,
      p.size * 0.5,
      p.r * 0.6,
      p.g * 0.6,
      p.b * 0.6,
      SH_CIRCLE,
    );
  }
}

export function updateProjectiles(dt: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.projectiles; i < POOL_PROJECTILES && rem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) continue;
    rem--;

    if (p.homing && p.target !== NO_UNIT) steerHomingProjectile(p, dt);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    projectileTrail(p, dt, rng);

    if (p.life <= 0) {
      if (p.aoe > 0) detonateAoe(p, rng);
      killProjectile(i as ProjectileIndex);
      continue;
    }

    detectProjectileHit(p, i as ProjectileIndex, rng);
  }
}
