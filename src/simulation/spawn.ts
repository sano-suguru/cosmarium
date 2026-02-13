import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
import { beams } from '../state.ts';
import type { ParticleIndex, ProjectileIndex, Team, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from '../types.ts';
import { TYPES } from '../unit-types.ts';

type MutablePoolCounts = { -readonly [K in keyof typeof poolCounts]: (typeof poolCounts)[K] };
/**
 * poolCounts への唯一の mutable alias — カウンタ変更は spawn.ts（と resetPoolCounts）に集約。
 * 他ファイルで同様の `as MutablePoolCounts` キャストを行わないこと。
 * Readonly<> はうっかり防止であり `as` で容易にバイパスできるため、この集約が唯一の防御線。
 */
const _counts = poolCounts as MutablePoolCounts;

export function spawnUnit(team: Team, type: number, x: number, y: number): UnitIndex {
  for (let i = 0; i < POOL_UNITS; i++) {
    if (!unitPool[i]!.alive) {
      const u = unitPool[i]!,
        t = TYPES[type]!;
      u.alive = true;
      u.team = team;
      u.type = type;
      u.x = x;
      u.y = y;
      u.vx = 0;
      u.vy = 0;
      u.angle = Math.random() * 6.283;
      u.hp = t.hp;
      u.maxHp = t.hp;
      u.cooldown = Math.random() * t.fireRate;
      u.target = NO_UNIT;
      u.wanderAngle = Math.random() * 6.283;
      u.trailTimer = 0;
      u.mass = t.mass;
      u.abilityCooldown = 0;
      u.shielded = false;
      u.stun = 0;
      u.spawnCooldown = 0;
      u.teleportTimer = 0;
      u.beamOn = 0;
      u.kills = 0;
      u.vet = 0;
      _counts.unitCount++;
      return i as UnitIndex;
    }
  }
  return NO_UNIT;
}

export function killUnit(i: UnitIndex) {
  if (unitPool[i]!.alive) {
    unitPool[i]!.alive = false;
    _counts.unitCount--;
  }
}

export function killParticle(i: ParticleIndex) {
  if (particlePool[i]!.alive) {
    particlePool[i]!.alive = false;
    _counts.particleCount--;
  }
}

export function killProjectile(i: ProjectileIndex) {
  if (projectilePool[i]!.alive) {
    projectilePool[i]!.alive = false;
    _counts.projectileCount--;
  }
}

export function spawnParticle(
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  r: number,
  g: number,
  b: number,
  shape: number,
): ParticleIndex {
  for (let i = 0; i < POOL_PARTICLES; i++) {
    if (!particlePool[i]!.alive) {
      const p = particlePool[i]!;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.maxLife = life;
      p.size = size;
      p.r = r;
      p.g = g;
      p.b = b;
      p.shape = shape || 0;
      _counts.particleCount++;
      return i as ParticleIndex;
    }
  }
  return NO_PARTICLE;
}

export function spawnProjectile(
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  damage: number,
  team: Team,
  size: number,
  r: number,
  g: number,
  b: number,
  homing?: boolean,
  aoe?: number,
  targetIndex?: UnitIndex,
): ProjectileIndex {
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    if (!projectilePool[i]!.alive) {
      const p = projectilePool[i]!;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.damage = damage;
      p.team = team;
      p.size = size;
      p.r = r;
      p.g = g;
      p.b = b;
      p.homing = homing ?? false;
      p.aoe = aoe ?? 0;
      p.targetIndex = targetIndex ?? NO_UNIT;
      _counts.projectileCount++;
      return i as ProjectileIndex;
    }
  }
  return NO_PROJECTILE;
}

export function resetPoolCounts() {
  _counts.unitCount = 0;
  _counts.particleCount = 0;
  _counts.projectileCount = 0;
}

export function addBeam(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  life: number,
  width: number,
) {
  beams.push({ x1: x1, y1: y1, x2: x2, y2: y2, r: r, g: g, b: b, life: life, maxLife: life, width: width });
}
