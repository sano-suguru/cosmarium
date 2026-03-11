import { POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { projectileIdx, unitIdx } from '../pool-index.ts';
import {
  advanceParticleHWM,
  advanceProjectileHWM,
  advanceUnitHWM,
  decMotherships,
  decParticles,
  decProjectiles,
  decUnits,
  incParticles,
  incProjectiles,
  incUnits,
  teamUnitCounts,
} from '../pools.ts';
import { allocParticleSlot, freeParticleSlot } from '../pools-particle.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import type { Team } from '../team.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_SOURCE_TYPE, NO_SQUADRON, NO_UNIT } from '../types.ts';
import { MOTHERSHIP_TYPE, unitType } from '../unit-type-accessors.ts';
import type { KillContext } from './on-kill-effects.ts';
import { dispatchKillEvent, dispatchSpawnEvent } from './spawn-hooks.ts';

export interface Killer {
  index: UnitIndex;
  team: Team;
  type: UnitTypeIndex;
}

interface KilledUnitSnapshot {
  readonly x: number;
  readonly y: number;
  readonly team: Team;
  readonly type: UnitTypeIndex;
}

export function captureKiller(i: UnitIndex): Killer | undefined {
  const u = unit(i);
  if (!u.alive) {
    return undefined;
  }
  return { index: i, team: u.team, type: u.type };
}

export function spawnUnit(team: Team, type: UnitTypeIndex, x: number, y: number, rng: () => number): UnitIndex {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (!u.alive) {
      const t = unitType(type);
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
      u.hp = t.hp;
      u.maxHp = t.hp;
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
      u.kills = 0;
      u.vet = 0;
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

export function killUnit(
  i: UnitIndex,
  killer: Killer | undefined,
  killContext: KillContext,
): KilledUnitSnapshot | undefined {
  const u = unit(i);
  if (u.alive) {
    const snap: KilledUnitSnapshot = { x: u.x, y: u.y, team: u.team, type: u.type };
    const squadronIdx = u.squadronIdx;
    u.alive = false;
    // 実行順序契約: alive=false → decUnits → decMotherships → hook
    // hook 内では teamUnitCounts・mothershipIdx ともに減算/更新済み。
    // 母艦 kill 時は mothershipIdx[victimTeam] === NO_UNIT が保証される。
    decUnits(u.team);
    if (u.type === MOTHERSHIP_TYPE) {
      decMotherships(u.team);
    }
    dispatchKillEvent(i, u.team, u.type, squadronIdx, killContext, killer, teamUnitCounts[u.team]);
    return snap;
  }
  return undefined;
}

export function killParticle(i: ParticleIndex) {
  const p = particle(i);
  if (p.alive) {
    p.alive = false;
    decParticles();
    freeParticleSlot(i);
  }
}

export function killProjectile(i: ProjectileIndex) {
  const p = projectile(i);
  if (p.alive) {
    p.alive = false;
    decProjectiles();
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
      const homing = opts?.homing ?? false;
      const aoe = opts?.aoe ?? 0;
      const target = opts?.target ?? NO_UNIT;
      const sourceUnit = opts?.sourceUnit ?? NO_UNIT;
      p.homing = homing;
      p.aoe = aoe;
      p.target = target;
      p.sourceUnit = sourceUnit;
      if (sourceUnit !== NO_UNIT) {
        const src = unit(sourceUnit);
        p.sourceType = src.alive ? src.type : NO_SOURCE_TYPE;
      } else {
        p.sourceType = NO_SOURCE_TYPE;
      }
      advanceProjectileHWM(i);
      incProjectiles();
      return projectileIdx(i);
    }
  }
  return NO_PROJECTILE;
}
