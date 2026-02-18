import {
  MAX_STEPS_PER_FRAME,
  PI,
  POOL_PARTICLES,
  POOL_PROJECTILES,
  POOL_UNITS,
  REF_FPS,
  REFLECTOR_SHIELD_LINGER,
  REFLECTOR_TETHER_BEAM_LIFE,
  SWARM_RADIUS_SQ,
  TAU,
} from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { beams, getBeam, getTrackingBeam, rng, state, trackingBeams } from '../state.ts';
import type { ParticleIndex, Projectile, ProjectileIndex, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { isCodexDemoUnit, updateCodexDemo } from '../ui/codex.ts';
import { getUnitType } from '../unit-types.ts';
import { combat, resetReflectedSet } from './combat.ts';
import { boostBurst, boostTrail, explosion, trail, updatePendingChains } from './effects.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addTrackingBeam, killParticle, killProjectile, killUnit, spawnParticle } from './spawn.ts';
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
  if (rng() < 1 - 0.5 ** (dt * REF_FPS)) {
    spawnParticle(p.x, p.y, (rng() - 0.5) * 18, (rng() - 0.5) * 18, 0.12, 1.8, 0.4, 0.4, 0.4, 0);
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
        explosion(o.x, o.y, o.team, o.type, NO_UNIT, rng);
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
      if (o.shieldLingerTimer > 0) dmg *= REFLECTOR_PROJECTILE_SHIELD_MULTIPLIER;
      o.hp -= dmg;
      knockback(oi, p.x, p.y, p.damage * 12);
      spawnParticle(p.x, p.y, (rng() - 0.5) * 70, (rng() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, 0);
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, NO_UNIT, rng);
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
    if (rng() < 1 - 0.65 ** (dt * REF_FPS)) {
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
    const drag = 0.97 ** (dt * REF_FPS);
    pp.vx *= drag;
    pp.vy *= drag;
    pp.life -= dt;
    if (pp.life <= 0) {
      killParticle(i as ParticleIndex);
    }
  }
}

function updateBeams(dt: number) {
  for (let i = 0; i < beams.length; ) {
    const bm = getBeam(i);
    bm.life -= dt;
    if (bm.life <= 0) {
      const last = beams[beams.length - 1];
      if (last !== undefined) beams[i] = last;
      beams.pop();
    } else {
      i++;
    }
  }
}

function updateTrackingBeams(dt: number) {
  for (let i = 0; i < trackingBeams.length; ) {
    const tb = getTrackingBeam(i);
    tb.life -= dt;
    const src = getUnit(tb.srcUnit);
    const tgt = getUnit(tb.tgtUnit);
    if (tb.life <= 0 || !src.alive || !tgt.alive || src.team !== tgt.team) {
      const last = trackingBeams[trackingBeams.length - 1];
      if (last !== undefined) trackingBeams[i] = last;
      trackingBeams.pop();
      continue;
    }
    tb.x1 = src.x;
    tb.y1 = src.y;
    tb.x2 = tgt.x;
    tb.y2 = tgt.y;
    i++;
  }
}

function countSwarmAllies(u: Unit): number {
  const nn = getNeighbors(u.x, u.y, 80);
  let allies = 0;
  for (let j = 0; j < nn; j++) {
    const o = getUnit(getNeighborAt(j));
    if (o === u || !o.alive || o.team !== u.team || o.type !== u.type) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy < SWARM_RADIUS_SQ) allies++;
  }
  return Math.min(allies, 6);
}

export function updateSwarmN() {
  for (let i = 0, urem3 = poolCounts.unitCount; i < POOL_UNITS && urem3 > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem3--;
    if (state.codexOpen && !isCodexDemoUnit(i as UnitIndex)) {
      u.swarmN = 0;
      continue;
    }
    if (!getUnitType(u.type).swarm) {
      u.swarmN = 0;
      continue;
    }
    u.swarmN = countSwarmAllies(u);
  }
}

function updateUnits(dt: number, now: number) {
  for (let i = 0, urem = poolCounts.unitCount; i < POOL_UNITS && urem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem--;
    if (state.codexOpen && !isCodexDemoUnit(i as UnitIndex)) continue;
    const wasNotBoosting = u.boostTimer <= 0;
    steer(u, dt, rng);
    combat(u, i as UnitIndex, dt, now, rng);
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + rng() * 0.02;
      trail(u, rng);
    }
    if (u.boostTimer > 0 && u.stun <= 0) {
      boostTrail(u, dt, rng);
      if (wasNotBoosting) boostBurst(u, rng);
    }
  }
}

function decayShieldTimers(dt: number) {
  for (let i = 0, rem = poolCounts.unitCount; i < POOL_UNITS && rem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    rem--;
    if (u.shieldLingerTimer > 0) u.shieldLingerTimer = Math.max(0, u.shieldLingerTimer - dt);
  }
}

function shieldNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, 100);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = getUnit(oi);
    if (!o.alive || o.team !== u.team || oi === i || getUnitType(o.type).reflects) continue;
    if (o.shieldLingerTimer <= 0) addTrackingBeam(i as UnitIndex, oi, 0.3, 0.6, 1.0, REFLECTOR_TETHER_BEAM_LIFE, 1.5);
    o.shieldLingerTimer = REFLECTOR_SHIELD_LINGER;
  }
}

function applyReflectorShields(dt: number) {
  decayShieldTimers(dt);
  for (let i = 0, urem2 = poolCounts.unitCount; i < POOL_UNITS && urem2 > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    urem2--;
    if (state.codexOpen && !isCodexDemoUnit(i as UnitIndex)) continue;
    if (!getUnitType(u.type).reflects) continue;
    shieldNearbyAllies(u, i);
  }
}

function stepOnce(dt: number, now: number) {
  buildHash();
  updateSwarmN();
  resetReflectedSet();

  updateUnits(dt, now);

  applyReflectorShields(dt);

  updateProjectiles(dt);
  updateParticles(dt);
  updateBeams(dt);
  updatePendingChains(dt, rng);
  updateTrackingBeams(dt);

  if (!state.codexOpen) {
    reinforce(dt, rng, state);
  } else {
    updateCodexDemo(dt);
  }
}

export function update(rawDt: number, now: number) {
  const maxStep = 1 / REF_FPS;
  if (rawDt <= maxStep) {
    stepOnce(rawDt, now);
  } else {
    const steps = Math.min(Math.ceil(rawDt / maxStep), MAX_STEPS_PER_FRAME);
    const dt = rawDt / steps;
    for (let s = 0; s < steps; s++) {
      stepOnce(dt, now);
    }
  }
}
