import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
import { beams } from '../state.ts';
import type { Team } from '../types.ts';
import { TYPES } from '../unit-types.ts';

export function spawnUnit(team: Team, type: number, x: number, y: number): number {
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
      u.target = -1;
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
      poolCounts.unitCount++;
      return i;
    }
  }
  return -1;
}

export function killUnit(i: number) {
  if (unitPool[i]!.alive) {
    unitPool[i]!.alive = false;
    poolCounts.unitCount--;
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
): number {
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
      poolCounts.particleCount++;
      return i;
    }
  }
  return -1;
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
  targetIndex?: number,
): number {
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
      p.targetIndex = targetIndex ?? -1;
      poolCounts.projectileCount++;
      return i;
    }
  }
  return -1;
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
