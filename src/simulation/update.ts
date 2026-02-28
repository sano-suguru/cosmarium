import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { POOL_PARTICLES, POOL_UNITS, REF_FPS } from '../constants.ts';
import { particle, poolCounts, unit } from '../pools.ts';
import { swapRemove } from '../swap-remove.ts';
import type { ParticleIndex, Unit, UnitIndex } from '../types.ts';
import { unitType, unitTypeIndex } from '../unit-types.ts';
import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail, updateChains } from './effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { killParticle } from './spawn.ts';
import { steer } from './steering.ts';
import { applyShieldsAndFields, decayHitFlash, regenEnergy } from './update-fields.ts';
import { updateProjectiles } from './update-projectiles.ts';

const SWARM_RADIUS_SQ = 80 * 80;
export const MAX_STEPS_PER_FRAME = 8;

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
      swapRemove(beams, i);
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
      swapRemove(trackingBeams, i);
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
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
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
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
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
  regenEnergy(dt);

  applyShieldsAndFields(dt);

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
