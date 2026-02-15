import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import {
  decParticleCount,
  decProjectileCount,
  decUnitCount,
  getParticle,
  getProjectile,
  getUnit,
  incParticleCount,
  incProjectileCount,
  incUnitCount,
} from '../pools.ts';
import { beams } from '../state.ts';
import type { Beam, ParticleIndex, ProjectileIndex, Team, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';

type KillUnitHook = (i: UnitIndex) => void;
const killUnitHooks: KillUnitHook[] = [];

export function onKillUnit(hook: KillUnitHook) {
  killUnitHooks.push(hook);
}

export function spawnUnit(team: Team, type: number, x: number, y: number): UnitIndex {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) {
      const t = getUnitType(type);
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
      u.sweepPhase = 0;
      u.sweepBaseAngle = 0;
      u.kills = 0;
      u.vet = 0;
      incUnitCount();
      return i as UnitIndex;
    }
  }
  return NO_UNIT;
}

export function killUnit(i: UnitIndex) {
  const u = getUnit(i);
  if (u.alive) {
    u.alive = false;
    decUnitCount();
    for (const hook of killUnitHooks) hook(i);
  }
}

export function killParticle(i: ParticleIndex) {
  const p = getParticle(i);
  if (p.alive) {
    p.alive = false;
    decParticleCount();
  }
}

export function killProjectile(i: ProjectileIndex) {
  const p = getProjectile(i);
  if (p.alive) {
    p.alive = false;
    decProjectileCount();
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
    const p = getParticle(i);
    if (!p.alive) {
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
      incParticleCount();
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
    const p = getProjectile(i);
    if (!p.alive) {
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
      incProjectileCount();
      return i as ProjectileIndex;
    }
  }
  return NO_PROJECTILE;
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
  tapered?: boolean,
  stepDiv?: number,
) {
  const bm: Beam = { x1, y1, x2, y2, r, g, b, life, maxLife: life, width };
  if (tapered) bm.tapered = true;
  if (stepDiv !== undefined && stepDiv > 1) bm.stepDiv = stepDiv;
  beams.push(bm);
}
