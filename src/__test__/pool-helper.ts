import { beams, trackingBeams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import {
  particle,
  projectile,
  resetPoolCounts,
  setParticleCount,
  setProjectileCount,
  setUnitCount,
  unit,
} from '../pools.ts';
import { _resetSweepHits } from '../simulation/combat.ts';
import { resetChains } from '../simulation/effects.ts';
import { _resetKillUnitHooks, spawnUnit } from '../simulation/spawn.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { seedRng, state } from '../state.ts';
import type { UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';

export function resetPools() {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    u.alive = false;
    u.team = 0;
    u.type = 0;
    u.x = 0;
    u.y = 0;
    u.vx = 0;
    u.vy = 0;
    u.angle = 0;
    u.hp = 0;
    u.maxHp = 0;
    u.cooldown = 0;
    u.target = NO_UNIT;
    u.wanderAngle = 0;
    u.trailTimer = 0;
    u.mass = 1;
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
    u.blinkCount = 0;
    u.blinkPhase = 0;
    u.hitFlash = 0;
    u.energy = 0;
    u.maxEnergy = 0;
    u.shieldSourceUnit = NO_UNIT;
    u.shieldCooldown = 0;
    u.reflectFieldHp = 0;
    u.fieldGrantCooldown = 0;
    u.ampBoostTimer = 0;
  }
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = particle(i);
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.maxLife = 0;
    p.size = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.shape = 0;
  }
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = projectile(i);
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.damage = 0;
    p.team = 0;
    p.size = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.homing = false;
    p.aoe = 0;
    p.target = NO_UNIT;
    p.piercing = 0;
    p.lastHitUnit = NO_UNIT;
    p.sourceUnit = NO_UNIT;
  }
  resetPoolCounts();
  beams.length = 0;
  trackingBeams.length = 0;
  _resetSweepHits();
  _resetKillUnitHooks();
}

/** プールを意図的に満杯にするテスト専用ヘルパー。Readonly<> を bypass するため型キャストを使用 */
export function fillUnitPool() {
  for (let i = 0; i < POOL_UNITS; i++) unit(i).alive = true;
  setUnitCount(POOL_UNITS);
}

export function fillParticlePool() {
  for (let i = 0; i < POOL_PARTICLES; i++) particle(i).alive = true;
  setParticleCount(POOL_PARTICLES);
}

export function fillProjectilePool() {
  for (let i = 0; i < POOL_PROJECTILES; i++) projectile(i).alive = true;
  setProjectileCount(POOL_PROJECTILES);
}

const stateDefaults = {
  gameState: 'menu' as const,
  codexOpen: false,
  codexSelected: 0,
  timeScale: 1,
  reinforcementTimer: 0,
  rng: () => 0,
};

/** テスト分離用リセット。固定シード(12345)で PRNG を初期化し、各テストが同一の乱数列から開始する */
export function resetState() {
  Object.assign(state, stateDefaults);
  seedRng(12345);
  beams.length = 0;
  trackingBeams.length = 0;
  resetChains();
}

/** テスト用 GameLoopState ファクトリ。state のプロパティをリアルタイムに参照する getter/setter でラップする */
export function makeGameLoopState(updateCodexDemo: (dt: number) => void = () => undefined): GameLoopState {
  return {
    get codexOpen() {
      return state.codexOpen;
    },
    get reinforcementTimer() {
      return state.reinforcementTimer;
    },
    set reinforcementTimer(v: number) {
      state.reinforcementTimer = v;
    },
    updateCodexDemo,
  };
}

/** spawnUnit() の PRNG 依存（angle, cooldown, wanderAngle）を固定値で確定的にユニットを生成する共通ヘルパー */
export function spawnAt(team: 0 | 1, type: number, x: number, y: number): UnitIndex {
  return spawnUnit(team, type, x, y, () => 0);
}
