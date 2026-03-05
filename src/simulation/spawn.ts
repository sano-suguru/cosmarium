import { acquireBeam, acquireTrackingBeam, beams, trackingBeams } from '../beams.ts';
import { POOL_PROJECTILES, POOL_TRACKING_BEAMS, POOL_UNITS } from '../constants.ts';
import {
  advanceParticleHWM,
  advanceProjectileHWM,
  advanceUnitHWM,
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
  teamUnitCounts,
  unit,
} from '../pools.ts';
import type { ParticleIndex, ProjectileIndex, SquadronIndex, Team, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_SQUADRON, NO_UNIT } from '../types.ts';
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
  if (!u.alive) {
    return undefined;
  }
  return { index: i, team: u.team, type: u.type };
}

type KillEvent = {
  victim: UnitIndex;
  victimTeam: Team;
  victimType: number;
  victimSquadronIdx: SquadronIndex;
  /** decUnits 後の victimTeam の残存ユニット数。0 なら全滅。 */
  victimTeamRemaining: number;
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
    if (idx !== -1) {
      killUnitHooks.splice(idx, 1);
    }
  };
}

/** 永続フック登録。モジュール/アプリ初期化時に使用（unsubscribe不要、テストリセット対象外） */
export function onKillUnitPermanent(hook: KillUnitHook): void {
  permanentKillUnitHooks.push(hook);
}

/** テスト専用: テスト用killUnitHooksをクリア。永続フックは維持。pool-helper.tsのresetPools()から呼ばれる */
export function _resetKillUnitHooks(): void {
  killUnitHooks.length = 0;
  _keDepth = 0;
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
      return i as UnitIndex;
    }
  }
  return NO_UNIT;
}

// GC回避: KillEvent 深度インデックスド・スタック（再入安全・hookは参照保存しない前提）
const _KE_MAX_DEPTH = 4;
function _keAt<T>(stack: T[], d: number): T {
  const e = stack[d];
  if (!e) {
    throw new Error('KillEvent stack overflow');
  }
  return e;
}
const _keWK = Array.from({ length: _KE_MAX_DEPTH }, (): KillEvent & { killerTeam: Team; killerType: number } => ({
  victim: 0 as UnitIndex,
  victimTeam: 0 as Team,
  victimType: 0,
  victimSquadronIdx: NO_SQUADRON,
  victimTeamRemaining: 0,
  killer: 0 as UnitIndex,
  killerTeam: 0 as Team,
  killerType: 0,
}));
const _keNK = Array.from({ length: _KE_MAX_DEPTH }, (): KillEvent & { killer: typeof NO_UNIT } => ({
  victim: 0 as UnitIndex,
  victimTeam: 0 as Team,
  victimType: 0,
  victimSquadronIdx: NO_SQUADRON,
  victimTeamRemaining: 0,
  killer: NO_UNIT,
}));
let _keDepth = 0;

export function killUnit(i: UnitIndex, killer?: Killer): KilledUnitSnapshot | undefined {
  const u = unit(i);
  if (u.alive) {
    const snap: KilledUnitSnapshot = { x: u.x, y: u.y, team: u.team, type: u.type };
    const squadronIdx = u.squadronIdx;
    u.alive = false;
    // decUnits → hook の順序を保証: hook 内で victimTeamRemaining を参照可能
    decUnits(u.team);
    // GC回避: 深度インデックスド・スタックから取得（再入安全）
    const d = _keDepth++;
    let e: KillEvent;
    if (killer) {
      const ke = _keAt(_keWK, d);
      ke.victim = i;
      ke.victimTeam = u.team;
      ke.victimType = u.type;
      ke.victimSquadronIdx = squadronIdx;
      ke.victimTeamRemaining = teamUnitCounts[u.team];
      ke.killer = killer.index;
      ke.killerTeam = killer.team;
      ke.killerType = killer.type;
      e = ke;
    } else {
      const ke = _keAt(_keNK, d);
      ke.victim = i;
      ke.victimTeam = u.team;
      ke.victimType = u.type;
      ke.victimSquadronIdx = squadronIdx;
      ke.victimTeamRemaining = teamUnitCounts[u.team];
      e = ke;
    }
    for (const hook of killUnitHooks) {
      hook(e);
    }
    for (const hook of permanentKillUnitHooks) {
      hook(e);
    }
    _keDepth--;
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
  homing = false,
  aoe = 0,
  target: UnitIndex = NO_UNIT,
  sourceUnit: UnitIndex = NO_UNIT,
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
      p.homing = homing;
      p.aoe = aoe;
      p.target = target;
      p.sourceUnit = sourceUnit;
      advanceProjectileHWM(i);
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
  tapered = false,
  stepDiv = 1,
  lightning = false,
) {
  const bm = acquireBeam();
  bm.x1 = x1;
  bm.y1 = y1;
  bm.x2 = x2;
  bm.y2 = y2;
  bm.r = r;
  bm.g = g;
  bm.b = b;
  bm.life = life;
  bm.maxLife = life;
  bm.width = width;
  bm.tapered = tapered;
  bm.stepDiv = stepDiv;
  bm.lightning = lightning;
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
  if (trackingBeams.length >= POOL_TRACKING_BEAMS) {
    return;
  }
  const src = unit(srcUnit);
  const tgt = unit(tgtUnit);
  const tb = acquireTrackingBeam();
  tb.srcUnit = srcUnit;
  tb.tgtUnit = tgtUnit;
  tb.x1 = src.x;
  tb.y1 = src.y;
  tb.x2 = tgt.x;
  tb.y2 = tgt.y;
  tb.r = r;
  tb.g = g;
  tb.b = b;
  tb.life = life;
  tb.maxLife = life;
  tb.width = width;
  trackingBeams.push(tb);
}
