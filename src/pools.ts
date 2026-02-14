import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from './constants.ts';
import type { Particle, Projectile, Unit } from './types.ts';
import { NO_UNIT } from './types.ts';

const unitPool: Unit[] = [];
const particlePool: Particle[] = [];
const projectilePool: Projectile[] = [];

const _counts = { unitCount: 0, particleCount: 0, projectileCount: 0 };

export const poolCounts: Readonly<{ unitCount: number; particleCount: number; projectileCount: number }> = _counts;

/* mutation API — spawn.ts (+ テストヘルパー) のみが呼ぶ想定 */
export function incUnitCount() {
  if (_counts.unitCount >= POOL_UNITS) throw new RangeError(`unitCount at pool limit (${POOL_UNITS})`);
  _counts.unitCount++;
}
export function decUnitCount() {
  if (_counts.unitCount <= 0) throw new RangeError('unitCount already 0');
  _counts.unitCount--;
}
export function incParticleCount() {
  if (_counts.particleCount >= POOL_PARTICLES) throw new RangeError(`particleCount at pool limit (${POOL_PARTICLES})`);
  _counts.particleCount++;
}
export function decParticleCount() {
  if (_counts.particleCount <= 0) throw new RangeError('particleCount already 0');
  _counts.particleCount--;
}
export function incProjectileCount() {
  if (_counts.projectileCount >= POOL_PROJECTILES)
    throw new RangeError(`projectileCount at pool limit (${POOL_PROJECTILES})`);
  _counts.projectileCount++;
}
export function decProjectileCount() {
  if (_counts.projectileCount <= 0) throw new RangeError('projectileCount already 0');
  _counts.projectileCount--;
}
export function resetPoolCounts() {
  _counts.unitCount = 0;
  _counts.particleCount = 0;
  _counts.projectileCount = 0;
}
/** テスト専用: unitCount を任意値に設定 */
export function setUnitCount(n: number) {
  _counts.unitCount = n;
}

/*
 * プール配列への安全なアクセサ — noUncheckedIndexedAccess 下で
 * undefined チェックを集約し、不正 index には throw で防御する。
 * state.ts の getAsteroid / getBeam も同じパターンに統一済み。
 */
export function getUnit(i: number): Unit {
  const u = unitPool[i];
  if (u === undefined) throw new RangeError(`Invalid unit index: ${i}`);
  return u;
}
export function getParticle(i: number): Particle {
  const p = particlePool[i];
  if (p === undefined) throw new RangeError(`Invalid particle index: ${i}`);
  return p;
}
export function getProjectile(i: number): Projectile {
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
    shielded: false,
    stun: 0,
    spawnCooldown: 0,
    teleportTimer: 0,
    beamOn: 0,
    kills: 0,
    vet: 0,
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
    targetIndex: NO_UNIT,
  };
}
