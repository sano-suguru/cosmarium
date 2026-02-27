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

export interface Killer {
  index: UnitIndex;
  team: Team;
  type: number;
}

interface KilledUnitSnapshot {
  readonly x: number;
  readonly y: number;
  readonly team: Team;
  readonly type: number;
}

export function captureKiller(i: UnitIndex): Killer | undefined {
  const u = unit(i);
  if (!u.alive) return undefined;
  return { index: i, team: u.team, type: u.type };
}

type KillEvent = {
  victim: UnitIndex;
  victimTeam: Team;
  victimType: number;
} & (
  | { killer: UnitIndex; killerTeam: Team; killerType: number }
  | { killer: typeof NO_UNIT; killerTeam?: undefined; killerType?: undefined }
);

type KillUnitHook = (e: KillEvent) => void;
const killUnitHooks: KillUnitHook[] = [];
const permanentKillUnitHooks: KillUnitHook[] = [];
type Unsubscribe = () => void;
/** hookを登録し、登録解除用のunsubscribe関数を返す。呼び出し元がライフサイクルを管理すること */
export function onKillUnit(hook: KillUnitHook): Unsubscribe {
  killUnitHooks.push(hook);
  return () => {
    const idx = killUnitHooks.indexOf(hook);
    if (idx !== -1) killUnitHooks.splice(idx, 1);
  };
}

/** 永続フック登録。モジュール/アプリ初期化時に使用（unsubscribe不要、テストリセット対象外） */
export function onKillUnitPermanent(hook: KillUnitHook): void {
  permanentKillUnitHooks.push(hook);
}

/** テスト専用: テスト用killUnitHooksをクリア。永続フックは維持。pool-helper.tsのresetPools()から呼ばれる */
export function _resetKillUnitHooks(): void {
  killUnitHooks.length = 0;
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
      u.energy = t.maxEnergy ?? 0;
      u.maxEnergy = t.maxEnergy ?? 0;
      u.shieldSourceUnit = NO_UNIT;
      u.shieldCooldown = 0;
      u.reflectFieldHp = 0;
      u.fieldGrantCooldown = 0;
      u.ampBoostTimer = 0;
      u.scrambleTimer = 0;
      incUnits();
      return i as UnitIndex;
    }
  }
  return NO_UNIT;
}

export function killUnit(i: UnitIndex, killer?: Killer): KilledUnitSnapshot | undefined {
  const u = unit(i);
  if (u.alive) {
    const snap: KilledUnitSnapshot = { x: u.x, y: u.y, team: u.team, type: u.type };
    const base = { victim: i, victimTeam: u.team, victimType: u.type };
    const e: KillEvent = killer
      ? { ...base, killer: killer.index, killerTeam: killer.team, killerType: killer.type }
      : { ...base, killer: NO_UNIT };
    u.alive = false;
    decUnits();
    for (const hook of killUnitHooks) hook(e);
    for (const hook of permanentKillUnitHooks) hook(e);
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
