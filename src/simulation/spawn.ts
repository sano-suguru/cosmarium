import { beams, trackingBeams } from '../beams.ts';
import { POOL_PROJECTILES, POOL_TRACKING_BEAMS, POOL_UNITS } from '../constants.ts';
import {
  allocParticleSlot,
  decParticles,
  decProjectiles,
  decUnits,
  freeParticleSlot,
  incParticles,
  incProjectiles,
  incUnits,
  particle,
  projectile,
  unit,
} from '../pools.ts';
import type { Beam, ParticleIndex, ProjectileIndex, Team, TrackingBeam, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';

type KillUnitHook = (i: UnitIndex) => void;
const killUnitHooks: KillUnitHook[] = [];

export function onKillUnit(hook: KillUnitHook) {
  killUnitHooks.push(hook);
}

export function spawnUnit(team: Team, type: number, x: number, y: number, rng: () => number): UnitIndex {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (!u.alive) {
      const t = unitType(type);
      u.alive = true;
      u.team = team;
      u.type = type;
      u.x = x;
      u.y = y;
      u.vx = 0;
      u.vy = 0;
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
      incUnits();
      return i as UnitIndex;
    }
  }
  return NO_UNIT;
}

export function killUnit(i: UnitIndex) {
  const u = unit(i);
  if (u.alive) {
    u.alive = false;
    decUnits();
    for (const hook of killUnitHooks) hook(i);
  }
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
  if (slot === NO_PARTICLE) return NO_PARTICLE;
  const p = particle(slot);
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
  p.shape = shape;
  incParticles();
  return slot;
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
  target?: UnitIndex,
  piercing?: number,
  sourceUnit?: UnitIndex,
): ProjectileIndex {
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = projectile(i);
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
      p.target = target ?? NO_UNIT;
      p.piercing = piercing ?? 0;
      p.lastHitUnit = NO_UNIT;
      p.sourceUnit = sourceUnit ?? NO_UNIT;
      incProjectiles();
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
  lightning?: boolean,
) {
  const bm: Beam = { x1, y1, x2, y2, r, g, b, life, maxLife: life, width };
  if (tapered) bm.tapered = true;
  if (stepDiv !== undefined && stepDiv > 1) bm.stepDiv = stepDiv;
  if (lightning) bm.lightning = true;
  beams.push(bm);
}

export function addTrackingBeam(
  srcUnit: UnitIndex,
  tgtUnit: UnitIndex,
  r: number,
  g: number,
  b: number,
  life: number,
  width: number,
) {
  const src = unit(srcUnit);
  const tgt = unit(tgtUnit);
  const tb: TrackingBeam = {
    srcUnit,
    tgtUnit,
    x1: src.x,
    y1: src.y,
    x2: tgt.x,
    y2: tgt.y,
    r,
    g,
    b,
    life,
    maxLife: life,
    width,
  };
  if (trackingBeams.length >= POOL_TRACKING_BEAMS) return;
  trackingBeams.push(tb);
}
