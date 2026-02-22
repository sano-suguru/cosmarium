import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import {
  HIT_FLASH_DURATION,
  MAX_STEPS_PER_FRAME,
  PI,
  POOL_PARTICLES,
  POOL_PROJECTILES,
  POOL_UNITS,
  REF_FPS,
  SH_CIRCLE,
  SH_EXPLOSION_RING,
  SHIELD_LINGER,
  SWARM_RADIUS_SQ,
  TAU,
  TETHER_BEAM_LIFE,
} from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { particle, poolCounts, projectile, unit } from '../pools.ts';
import type { ParticleIndex, Projectile, ProjectileIndex, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType, unitTypeIndex } from '../unit-types.ts';
import { combat, resetReflected } from './combat.ts';
import { boostBurst, boostTrail, explosion, flagshipTrail, trail, updateChains } from './effects.ts';
import { applyOnKillEffects, KILL_CONTEXT } from './on-kill-effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addTrackingBeam, killParticle, killProjectile, killUnit, spawnParticle } from './spawn.ts';
import { steer } from './steering.ts';

const REFLECTOR_PROJECTILE_SHIELD_MULTIPLIER = 0.3;

function steerHomingProjectile(p: Projectile, dt: number, rng: () => number) {
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
  if (rng() < 1 - 0.5 ** (dt * REF_FPS)) {
    spawnParticle(p.x, p.y, (rng() - 0.5) * 18, (rng() - 0.5) * 18, 0.12, 1.8, 0.4, 0.4, 0.4, SH_CIRCLE);
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
        const ox = o.x,
          oy = o.y,
          oTeam = o.team,
          oType = o.type;
        killUnit(oi);
        explosion(ox, oy, oTeam, oType, p.sourceUnit, rng);
        applyOnKillEffects(p.sourceUnit, p.team, KILL_CONTEXT.ProjectileAoe);
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
  addShake(3);
}

function handleProjectileKill(p: Projectile, oi: UnitIndex, o: Unit, rng: () => number) {
  const ox = o.x,
    oy = o.y,
    oTeam = o.team,
    oType = o.type;
  killUnit(oi);
  explosion(ox, oy, oTeam, oType, p.sourceUnit, rng);
  applyOnKillEffects(p.sourceUnit, p.team, KILL_CONTEXT.ProjectileDirect);
}

function applyProjectileDamage(p: Projectile, oi: UnitIndex, o: Unit, rng: () => number) {
  let dmg = p.damage;
  if (o.shieldLingerTimer > 0) dmg *= REFLECTOR_PROJECTILE_SHIELD_MULTIPLIER;
  o.hp -= dmg;
  o.hitFlash = 1;
  knockback(oi, p.x, p.y, p.damage * 12);
  spawnParticle(p.x, p.y, (rng() - 0.5) * 70, (rng() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, SH_CIRCLE);
  if (o.hp <= 0) handleProjectileKill(p, oi, o, rng);
}

function detectProjectileHit(p: Projectile, pi: ProjectileIndex, rng: () => number): boolean {
  const nn = getNeighbors(p.x, p.y, 30);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = unit(oi);
    if (!o.alive || o.team === p.team) continue;
    if (p.piercing > 0 && oi === p.lastHitUnit) continue;
    const hs = unitType(o.type).size;
    if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) >= hs * hs) continue;
    applyProjectileDamage(p, oi, o, rng);
    if (p.piercing > 0) {
      p.damage *= p.piercing;
      p.lastHitUnit = oi;
      return true;
    }
    if (p.aoe > 0) {
      detonateAoe(p, rng, oi);
    }
    killProjectile(pi);
    return true;
  }
  return false;
}

function projectileTrail(p: Projectile, dt: number, rng: () => number) {
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
      SH_CIRCLE,
    );
  }
}

function updateProjectiles(dt: number, rng: () => number) {
  for (let i = 0, prem = poolCounts.projectiles; i < POOL_PROJECTILES && prem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) continue;
    prem--;

    if (p.homing && p.target !== NO_UNIT) steerHomingProjectile(p, dt, rng);

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

function updateParticles(dt: number) {
  for (let i = 0, rem = poolCounts.particles; i < POOL_PARTICLES && rem > 0; i++) {
    const pp = particle(i);
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
    const src = unit(tb.srcUnit);
    const tgt = unit(tb.tgtUnit);
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
    const o = unit(getNeighborAt(j));
    if (o === u || !o.alive || o.team !== u.team || o.type !== u.type) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy < SWARM_RADIUS_SQ) allies++;
  }
  return Math.min(allies, 6);
}

export function updateSwarmN() {
  for (let i = 0, urem3 = poolCounts.units; i < POOL_UNITS && urem3 > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    urem3--;
    if (!unitType(u.type).swarm) {
      u.swarmN = 0;
      continue;
    }
    u.swarmN = countSwarmAllies(u);
  }
}

const FLAGSHIP = unitTypeIndex('Flagship');

function emitTrail(u: Unit, rng: () => number) {
  if (u.type === FLAGSHIP) flagshipTrail(u, rng);
  else trail(u, rng);
}

function updateUnits(dt: number, now: number, rng: () => number) {
  for (let i = 0, urem = poolCounts.units; i < POOL_UNITS && urem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    urem--;
    const prevHp = u.hp;
    const wasNotBoosting = u.boostTimer <= 0;
    steer(u, dt, rng);
    combat(u, i as UnitIndex, dt, now, rng);
    if (u.alive && u.hp < prevHp) u.hitFlash = 1;
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + rng() * 0.02;
      emitTrail(u, rng);
    }
    if (u.boostTimer > 0 && u.stun <= 0) {
      boostTrail(u, dt, rng);
      if (wasNotBoosting) boostBurst(u, rng);
    }
  }
}

function decayHitFlash(dt: number) {
  const decay = dt / HIT_FLASH_DURATION;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - decay);
  }
}

function decayShieldTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.shieldLingerTimer > 0) u.shieldLingerTimer = Math.max(0, u.shieldLingerTimer - dt);
  }
}

function shieldNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, 100);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i || unitType(o.type).reflects) continue;
    if (o.shieldLingerTimer <= 0) addTrackingBeam(i as UnitIndex, oi, 0.3, 0.6, 1.0, TETHER_BEAM_LIFE, 1.5);
    o.shieldLingerTimer = SHIELD_LINGER;
  }
}

function applyReflectorShields(dt: number) {
  decayShieldTimers(dt);
  for (let i = 0, urem2 = poolCounts.units; i < POOL_UNITS && urem2 > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    urem2--;
    if (!unitType(u.type).reflects) continue;
    shieldNearbyAllies(u, i);
  }
}

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  updateCodexDemo: (dt: number) => void;
}

function stepOnce(dt: number, now: number, rng: () => number, gameState: GameLoopState) {
  const co = gameState.codexOpen;
  decayHitFlash(dt);
  buildHash();
  updateSwarmN();
  resetReflected();

  updateUnits(dt, now, rng);

  applyReflectorShields(dt);

  updateProjectiles(dt, rng);
  updateParticles(dt);
  updateBeams(dt);
  updateChains(dt, rng);
  updateTrackingBeams(dt);

  if (!co) {
    reinforce(dt, rng, gameState);
  } else {
    gameState.updateCodexDemo(dt);
  }
}

export function update(rawDt: number, now: number, rng: () => number, gameState: GameLoopState) {
  const maxStep = 1 / REF_FPS;
  if (rawDt <= maxStep) {
    stepOnce(rawDt, now, rng, gameState);
  } else {
    const steps = Math.min(Math.ceil(rawDt / maxStep), MAX_STEPS_PER_FRAME);
    const dt = rawDt / steps;
    for (let s = 0; s < steps; s++) {
      stepOnce(dt, now, rng, gameState);
    }
  }
}
