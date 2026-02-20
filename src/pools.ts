import { beams, trackingBeams } from './beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from './constants.ts';
import type { Particle, Projectile, Unit } from './types.ts';
import { NO_UNIT } from './types.ts';

const unitPool: Unit[] = [];
const particlePool: Particle[] = [];
const projectilePool: Projectile[] = [];

const _counts = { units: 0, particles: 0, projectiles: 0 };

export const poolCounts: Readonly<{ units: number; particles: number; projectiles: number }> = _counts;

/* mutation API — spawn.ts (+ テストヘルパー) のみが呼ぶ想定 */
export function incUnits() {
  if (_counts.units >= POOL_UNITS) throw new RangeError(`unitCount at pool limit (${POOL_UNITS})`);
  _counts.units++;
}
export function decUnits() {
  if (_counts.units <= 0) throw new RangeError('unitCount already 0');
  _counts.units--;
}
export function incParticles() {
  if (_counts.particles >= POOL_PARTICLES) throw new RangeError(`particleCount at pool limit (${POOL_PARTICLES})`);
  _counts.particles++;
}
export function decParticles() {
  if (_counts.particles <= 0) throw new RangeError('particleCount already 0');
  _counts.particles--;
}
export function incProjectiles() {
  if (_counts.projectiles >= POOL_PROJECTILES)
    throw new RangeError(`projectileCount at pool limit (${POOL_PROJECTILES})`);
  _counts.projectiles++;
}
export function decProjectiles() {
  if (_counts.projectiles <= 0) throw new RangeError('projectileCount already 0');
  _counts.projectiles--;
}
export function resetPoolCounts() {
  _counts.units = 0;
  _counts.particles = 0;
  _counts.projectiles = 0;
}
export function setUnitCount(n: number) {
  _counts.units = n;
}
export function setParticleCount(n: number) {
  _counts.particles = n;
}
export function setProjectileCount(n: number) {
  _counts.projectiles = n;
}
export function clearAllPools() {
  for (let i = 0; i < POOL_UNITS; i++) unit(i).alive = false;
  for (let i = 0; i < POOL_PARTICLES; i++) particle(i).alive = false;
  for (let i = 0; i < POOL_PROJECTILES; i++) projectile(i).alive = false;
  resetPoolCounts();
  beams.length = 0;
  trackingBeams.length = 0;
}

export function setPoolCounts(units: number, particles: number, projectiles: number) {
  if (units < 0 || units > POOL_UNITS) throw new RangeError(`unitCount out of range: ${units}`);
  if (particles < 0 || particles > POOL_PARTICLES) throw new RangeError(`particleCount out of range: ${particles}`);
  if (projectiles < 0 || projectiles > POOL_PROJECTILES)
    throw new RangeError(`projectileCount out of range: ${projectiles}`);
  _counts.units = units;
  _counts.particles = particles;
  _counts.projectiles = projectiles;
}

/* プール配列アクセサ — noUncheckedIndexedAccess の undefined チェックを集約 */
export function unit(i: number): Unit {
  const u = unitPool[i];
  if (u === undefined) throw new RangeError(`Invalid unit index: ${i}`);
  return u;
}
export function particle(i: number): Particle {
  const p = particlePool[i];
  if (p === undefined) throw new RangeError(`Invalid particle index: ${i}`);
  return p;
}
export function projectile(i: number): Projectile {
  const p = projectilePool[i];
  if (p === undefined) throw new RangeError(`Invalid projectile index: ${i}`);
  return p;
}

for (let i = 0; i < POOL_UNITS; i++) {
  unitPool[i] = {
    alive: false,
    team: 0,
    type: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 0,
    maxHp: 0,
    cooldown: 0,
    target: NO_UNIT,
    wanderAngle: 0,
    trailTimer: 0,
    mass: 1,
    abilityCooldown: 0,
    shieldLingerTimer: 0,
    stun: 0,
    boostTimer: 0,
    boostCooldown: 0,
    spawnCooldown: 0,
    teleportTimer: 0,
    beamOn: 0,
    sweepPhase: 0,
    sweepBaseAngle: 0,
    kills: 0,
    vet: 0,
    burstCount: 0,
    broadsidePhase: 0,
    swarmN: 0,
  };
}
for (let i = 0; i < POOL_PARTICLES; i++) {
  particlePool[i] = {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    size: 0,
    r: 0,
    g: 0,
    b: 0,
    shape: 0,
  };
}
for (let i = 0; i < POOL_PROJECTILES; i++) {
  projectilePool[i] = {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    damage: 0,
    team: 0,
    size: 0,
    r: 0,
    g: 0,
    b: 0,
    homing: false,
    aoe: 0,
    target: NO_UNIT,
  };
}
