import { PI, POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, TAU } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { bases, beams, getBeam, state } from '../state.ts';
import type { ParticleIndex, Projectile, ProjectileIndex, UnitIndex } from '../types.ts';
import { enemyTeam, NO_UNIT } from '../types.ts';
import { isCodexDemoUnit, updateCodexDemo } from '../ui/codex.ts';
import { showWin } from '../ui/game-control.ts';
import { getUnitType } from '../unit-types.ts';
import { combat } from './combat.ts';
import { explosion, trail } from './effects.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { killParticle, killProjectile, killUnit, spawnParticle } from './spawn.ts';
import { steer } from './steering.ts';

const REFLECTOR_PROJECTILE_SHIELD_MULTIPLIER = 0.3;

function steerHomingProjectile(p: Projectile, dt: number) {
  const tg = getUnit(p.targetIndex);
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
  if (Math.random() < 0.5) {
    spawnParticle(p.x, p.y, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, 0.12, 1.8, 0.4, 0.4, 0.4, 0);
  }
}

function detonateAoe(p: Projectile) {
  const nn = getNeighbors(p.x, p.y, p.aoe);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = getUnit(oi);
    if (!o.alive || o.team === p.team) continue;
    const ddx = o.x - p.x,
      ddy = o.y - p.y;
    if (ddx * ddx + ddy * ddy < p.aoe * p.aoe) {
      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
      o.hp -= p.damage * (1 - dd / (p.aoe * 1.2));
      knockback(oi, p.x, p.y, 220);
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, NO_UNIT);
      }
    }
  }
  for (let j = 0; j < 16; j++) {
    const a = Math.random() * 6.283;
    spawnParticle(
      p.x,
      p.y,
      Math.cos(a) * (40 + Math.random() * 110),
      Math.sin(a) * (40 + Math.random() * 110),
      0.3 + Math.random() * 0.3,
      3 + Math.random() * 3,
      1,
      0.55,
      0.15,
      0,
    );
  }
  spawnParticle(p.x, p.y, 0, 0, 0.4, p.aoe * 0.9, 1, 0.5, 0.15, 10);
  addShake(3);
}

function detectProjectileHit(p: Projectile, pi: ProjectileIndex): boolean {
  const nn = getNeighbors(p.x, p.y, 30);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = getUnit(oi);
    if (!o.alive || o.team === p.team) continue;
    const hs = getUnitType(o.type).size;
    if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) < hs * hs) {
      let dmg = p.damage;
      if (o.shielded) dmg *= REFLECTOR_PROJECTILE_SHIELD_MULTIPLIER;
      o.hp -= dmg;
      knockback(oi, p.x, p.y, p.damage * 12);
      spawnParticle(p.x, p.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, 0);
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, NO_UNIT);
      }
      killProjectile(pi);
      return true;
    }
  }
  return false;
}

function updateProjectiles(dt: number) {
  for (let i = 0, prem = poolCounts.projectileCount; i < POOL_PROJECTILES && prem > 0; i++) {
    const p = getProjectile(i);
    if (!p.alive) continue;
    prem--;

    if (p.homing && p.targetIndex !== NO_UNIT) steerHomingProjectile(p, dt);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (Math.random() < 0.25) {
      spawnParticle(
        p.x,
        p.y,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        0.04,
        p.size * 0.35,
        p.r * 0.5,
        p.g * 0.5,
        p.b * 0.5,
        0,
      );
    }

    if (p.life <= 0) {
      if (p.aoe > 0) detonateAoe(p);
      killProjectile(i as ProjectileIndex);
      continue;
    }

    detectProjectileHit(p, i as ProjectileIndex);
  }
}

function updateParticles(dt: number) {
  for (let i = 0, rem = poolCounts.particleCount; i < POOL_PARTICLES && rem > 0; i++) {
    const pp = getParticle(i);
    if (!pp.alive) continue;
    rem--;
    pp.x += pp.vx * dt;
    pp.y += pp.vy * dt;
    pp.vx *= 0.97;
    pp.vy *= 0.97;
    pp.life -= dt;
    if (pp.life <= 0) {
      killParticle(i as ParticleIndex);
    }
  }
}

function updateBeams(dt: number) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = getBeam(i);
    bm.life -= dt;
    if (bm.life <= 0) beams.splice(i, 1);
  }
}

function applyBaseDamage(dt: number) {
  for (let i = 0, urem = poolCounts.unitCount; i < POOL_UNITS && urem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem--;
    const eb = bases[enemyTeam(u.team)];
    const d = Math.sqrt((u.x - eb.x) * (u.x - eb.x) + (u.y - eb.y) * (u.y - eb.y));
    if (d < 80) {
      eb.hp -= getUnitType(u.type).damage * dt * 3;
      if (eb.hp < 0) eb.hp = 0;
    }
  }
}

// ⚠ showWin() → closeCodex() → teardownCodexDemo() → killUnit/killParticle/killProjectile
// simulation → UI → pool mutation のチェーン。killed ユニットは alive=false になるだけで
// プール位置は不変のため、同フレーム内の後続ループでは !alive で安全にスキップされる。
function checkWinConditions() {
  if (state.gameMode === 1) {
    let ac = 0,
      bc = 0;
    for (let i = 0, urem = poolCounts.unitCount; i < POOL_UNITS && urem > 0; i++) {
      const u = getUnit(i);
      if (!u.alive) continue;
      urem--;
      if (u.team === 0) ac++;
      else bc++;
    }
    if (ac === 0 || bc === 0) {
      state.winTeam = ac === 0 ? 1 : 0;
      showWin();
    }
  }
  if (state.gameMode === 2) {
    if (bases[0].hp <= 0) {
      state.winTeam = 1;
      showWin();
    } else if (bases[1].hp <= 0) {
      state.winTeam = 0;
      showWin();
    }
  }
}

function updateUnits(dt: number, now: number) {
  for (let i = 0, urem = poolCounts.unitCount; i < POOL_UNITS && urem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem--;
    u.shielded = false;
    if (state.codexOpen && !isCodexDemoUnit(i as UnitIndex)) continue;
    steer(u, dt);
    combat(u, i as UnitIndex, dt, now);
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + Math.random() * 0.02;
      trail(u);
    }
  }
}

export function update(rawDt: number, now: number) {
  const dt = Math.min(rawDt, 0.033);
  buildHash();

  updateUnits(dt, now);

  for (let i = 0, urem2 = poolCounts.unitCount; i < POOL_UNITS && urem2 > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem2--;
    if (state.codexOpen && !isCodexDemoUnit(i as UnitIndex)) continue;
    if (!getUnitType(u.type).reflects) continue;
    const nn = getNeighbors(u.x, u.y, 100);
    for (let j = 0; j < nn; j++) {
      const o = getUnit(getNeighborAt(j));
      if (o.alive && o.team === u.team) o.shielded = true;
    }
  }

  updateProjectiles(dt);
  updateParticles(dt);
  updateBeams(dt);

  if (!state.codexOpen) {
    if (state.gameMode === 2) applyBaseDamage(dt);
    reinforce(dt);
    checkWinConditions();
  } else {
    updateCodexDemo(dt);
  }
}
