import { POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { MERGE_STAT_BONUS } from '../merge-config.ts';
import { projectileIdx, unitIdx } from '../pool-index.ts';
import {
  advanceParticleHWM,
  advanceProjectileHWM,
  advanceUnitHWM,
  decParticles,
  decProjectiles,
  incParticles,
  incProjectiles,
  incUnits,
} from '../pools.ts';
import { allocParticleSlot, freeParticleSlot } from '../pools-particle.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import type { Team } from '../team.ts';
import type { ModuleId, ParticleIndex, ProjectileIndex, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_MODULE, NO_PARTICLE, NO_PROJECTILE, NO_SQUADRON, NO_TYPE, NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import { dispatchSpawnEvent } from './spawn-hooks.ts';

export interface Killer {
  index: UnitIndex;
  team: Team;
  type: UnitTypeIndex;
}

interface KilledParticleSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface KilledProjectileSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly team: Team;
  readonly damage: number;
  readonly aoe: number;
  readonly sourceUnit: UnitIndex;
  readonly sourceType: UnitTypeIndex;
}

const _particleSnap = { x: 0, y: 0, vx: 0, vy: 0, size: 0, r: 0, g: 0, b: 0 } satisfies KilledParticleSnapshot;
const _projectileSnap = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  team: 0 as Team,
  damage: 0,
  aoe: 0,
  sourceUnit: 0 as UnitIndex,
  sourceType: 0 as UnitTypeIndex,
} satisfies KilledProjectileSnapshot;

export function captureKiller(i: UnitIndex): Killer | undefined {
  const u = unit(i);
  if (!u.alive) {
    return undefined;
  }
  return { index: i, team: u.team, type: u.type };
}

export function spawnUnit(
  team: Team,
  type: UnitTypeIndex,
  x: number,
  y: number,
  rng: () => number,
  mergeExp = 0,
  hpMul = 1.0,
  moduleId: ModuleId = NO_MODULE,
): UnitIndex {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (!u.alive) {
      const t = unitType(type);
      const mergeStat = 1 + mergeExp * MERGE_STAT_BONUS;
      u.mergeDmgMul = mergeStat;
      u.alive = true;
      u.team = team;
      u.type = type;
      u.x = x;
      u.y = y;
      u.prevX = x;
      u.prevY = y;
      u.vx = 0;
      u.vy = 0;
      u.kbVx = 0;
      u.kbVy = 0;
      u.angle = rng() * 6.283;
      u.hp = t.hp * mergeStat * hpMul;
      u.maxHp = t.hp * mergeStat * hpMul;
      u.cooldown = rng() * t.fireRate;
      u.target = NO_UNIT;
      u.wanderAngle = rng() * 6.283;
      u.trailTimer = 0;
      u.mass = t.mass;
      u.abilityCooldown = 0;
      u.shieldLingerTimer = 0;
      u.stun = 0;
      u.boostTimer = 0;
      u.boostCooldown = 0;
      u.spawnCooldown = 0;
      u.teleportTimer = 0;
      u.beamOn = 0;
      u.sweepPhase = 0;
      u.sweepBaseAngle = 0;
      u.burstCount = 0;
      u.broadsidePhase = 0;
      u.swarmN = 0;
      u.hitFlash = 0;
      u.blinkCount = 0;
      u.blinkPhase = 0;
      u.energy = t.maxEnergy;
      u.maxEnergy = t.maxEnergy;
      u.shieldSourceUnit = NO_UNIT;
      u.shieldCooldown = 0;
      u.reflectFieldHp = 0;
      u.fieldGrantCooldown = 0;
      u.ampBoostTimer = 0;
      u.scrambleTimer = 0;
      u.catalystTimer = 0;
      u.moduleId = moduleId;
      u.squadronIdx = NO_SQUADRON;
      advanceUnitHWM(i);
      incUnits(team);
      const idx = unitIdx(i);
      dispatchSpawnEvent(idx, team, type);
      return idx;
    }
  }
  return NO_UNIT;
}

export function killParticle(i: ParticleIndex): KilledParticleSnapshot | undefined {
  const p = particle(i);
  if (p.alive) {
    _particleSnap.x = p.x;
    _particleSnap.y = p.y;
    _particleSnap.vx = p.vx;
    _particleSnap.vy = p.vy;
    _particleSnap.size = p.size;
    _particleSnap.r = p.r;
    _particleSnap.g = p.g;
    _particleSnap.b = p.b;
    p.alive = false;
    decParticles();
    freeParticleSlot(i);
    return _particleSnap;
  }
  return undefined;
}

export function killProjectile(i: ProjectileIndex): KilledProjectileSnapshot | undefined {
  const p = projectile(i);
  if (p.alive) {
    _projectileSnap.x = p.x;
    _projectileSnap.y = p.y;
    _projectileSnap.vx = p.vx;
    _projectileSnap.vy = p.vy;
    _projectileSnap.team = p.team;
    _projectileSnap.damage = p.damage;
    _projectileSnap.aoe = p.aoe;
    _projectileSnap.sourceUnit = p.sourceUnit;
    _projectileSnap.sourceType = p.sourceType;
    p.alive = false;
    decProjectiles();
    return _projectileSnap;
  }
  return undefined;
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
  const slot = allocParticleSlot();
  if (slot === NO_PARTICLE) {
    return NO_PARTICLE;
  }
  const p = particle(slot);
  p.alive = true;
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = vx;
  p.vy = vy;
  p.life = life;
  p.maxLife = life;
  p.size = size;
  p.r = r;
  p.g = g;
  p.b = b;
  p.shape = shape;
  advanceParticleHWM(slot);
  incParticles();
  return slot;
}

interface ProjectileOpts {
  readonly homing?: boolean;
  readonly aoe?: number;
  readonly target?: UnitIndex;
  readonly sourceUnit?: UnitIndex;
}

function resolveSourceType(sourceUnit: UnitIndex): UnitTypeIndex {
  if (sourceUnit === NO_UNIT) {
    return NO_TYPE;
  }
  const src = unit(sourceUnit);
  return src.alive ? src.type : NO_TYPE;
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
  opts?: ProjectileOpts,
): ProjectileIndex {
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = projectile(i);
    if (!p.alive) {
      p.alive = true;
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.damage = damage;
      p.team = team;
      p.size = size;
      p.r = r;
      p.g = g;
      p.b = b;
      p.homing = opts?.homing ?? false;
      p.aoe = opts?.aoe ?? 0;
      p.target = opts?.target ?? NO_UNIT;
      const sourceUnit = opts?.sourceUnit ?? NO_UNIT;
      p.sourceUnit = sourceUnit;
      p.sourceType = resolveSourceType(sourceUnit);
      advanceProjectileHWM(i);
      incProjectiles();
      return projectileIdx(i);
    }
  }
  return NO_PROJECTILE;
}
