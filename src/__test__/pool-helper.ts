import { _resetBattleTracker } from '../battle-tracker.ts';
import { beams, clearBeamPools, trackingBeams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_SQUADRONS, POOL_UNITS } from '../constants.ts';
import { _resetMeleeTracker } from '../melee-tracker.ts';
import {
  advanceParticleHWM,
  advanceProjectileHWM,
  advanceUnitHWM,
  getParticleHWM,
  getProjectileHWM,
  getUnitHWM,
  particle,
  projectile,
  resetHWM,
  resetPoolCounts,
  setParticleCount,
  setProjectileCount,
  setUnitCount,
  squadron,
  unit,
} from '../pools.ts';
import { _resetSweepHits } from '../simulation/combat-sweep.ts';
import { resetChains } from '../simulation/effects.ts';
import { _resetDamageHooks, _resetSupportHooks } from '../simulation/hooks.ts';
import type { KillContext } from '../simulation/on-kill-effects.ts';
import { KILL_CONTEXT } from '../simulation/on-kill-effects.ts';
import { emptyProductions } from '../simulation/production.ts';
import type { Killer } from '../simulation/spawn.ts';
import { _resetKillUnitHooks, _resetSpawnUnitHooks, killUnit, spawnUnit } from '../simulation/spawn.ts';
import { resetTeamCenters } from '../simulation/team-center.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { seedRng, state } from '../state.ts';
import type { Team, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_SQUADRON, NO_UNIT } from '../types.ts';
import { _resetFleetCompose } from '../ui/fleet-compose/FleetCompose.tsx';
import { _resetGameControl } from '../ui/game-control.ts';
import { DEFAULT_UNIT_TYPE } from '../unit-type-accessors.ts';

export function resetPools() {
  const uHwm = getUnitHWM();
  const pHwm = getParticleHWM();
  const prHwm = getProjectileHWM();

  for (let i = 0; i < uHwm; i++) {
    const u = unit(i);
    u.alive = false;
    u.team = 0;
    u.type = DEFAULT_UNIT_TYPE;
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
    u.kbVx = 0;
    u.kbVy = 0;
    u.energy = 0;
    u.maxEnergy = 0;
    u.shieldSourceUnit = NO_UNIT;
    u.shieldCooldown = 0;
    u.reflectFieldHp = 0;
    u.fieldGrantCooldown = 0;
    u.ampBoostTimer = 0;
    u.scrambleTimer = 0;
    u.catalystTimer = 0;
    u.squadronIdx = NO_SQUADRON;
  }
  for (let i = 0; i < pHwm; i++) {
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
  for (let i = 0; i < prHwm; i++) {
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
    p.sourceUnit = NO_UNIT;
  }
  resetPoolCounts();
  resetHWM();
  for (let i = 0; i < POOL_SQUADRONS; i++) {
    const s = squadron(i);
    s.alive = false;
    s.memberCount = 0;
  }
  beams.length = 0;
  trackingBeams.length = 0;
  clearBeamPools();
  _resetSweepHits();
  _resetKillUnitHooks();
  _resetSpawnUnitHooks();
  _resetDamageHooks();
  _resetSupportHooks();
  _resetBattleTracker();
  _resetMeleeTracker();
  _resetFleetCompose();
  _resetGameControl();
  resetTeamCenters();
}

/** プールを意図的に満杯にするテスト専用ヘルパー。Readonly<> を bypass するため型キャストを使用 */
export function fillUnitPool() {
  for (let i = 0; i < POOL_UNITS; i++) {
    unit(i).alive = true;
  }
  advanceUnitHWM(POOL_UNITS - 1);
  setUnitCount(POOL_UNITS);
}

export function fillParticlePool() {
  for (let i = 0; i < POOL_PARTICLES; i++) {
    particle(i).alive = true;
  }
  advanceParticleHWM(POOL_PARTICLES - 1);
  setParticleCount(POOL_PARTICLES);
}

export function fillProjectilePool() {
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    projectile(i).alive = true;
  }
  advanceProjectileHWM(POOL_PROJECTILES - 1);
  setProjectileCount(POOL_PROJECTILES);
}

/** テスト用: スロットを alive にし HWM を同期する。poolCounts は更新しない（呼び出し側の責任） */
export function reviveUnit(i: number) {
  unit(i).alive = true;
  advanceUnitHWM(i);
}

/** テスト用: スロットを alive にし HWM を同期する。poolCounts は更新しない（呼び出し側の責任） */
export function reviveParticle(i: number) {
  particle(i).alive = true;
  advanceParticleHWM(i);
}

/** テスト用: スロットを alive にし HWM を同期する。poolCounts は更新しない（呼び出し側の責任） */
export function reviveProjectile(i: number) {
  projectile(i).alive = true;
  advanceProjectileHWM(i);
}

const stateDefaults = {
  gameState: 'menu' as const,
  codexOpen: false,
  codexSelected: DEFAULT_UNIT_TYPE,
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
  clearBeamPools();
  resetChains();
}

/** テスト用 GameLoopState ファクトリ。state のプロパティをリアルタイムに参照する getter/setter でラップする */
export function makeGameLoopState(
  updateCodexDemo: (dt: number) => void = () => undefined,
  battlePhase: GameLoopState['battlePhase'] = 'spectate',
): GameLoopState {
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
    battlePhase,
    activeTeamCount: 2,
    updateCodexDemo,
    productions: emptyProductions(),
  };
}

/** ベンチ用の軽量 LCG-PRNG。reset() でシードを初期化可能 */
export function makeRng() {
  let s = 12345;
  const fn = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  fn.reset = () => {
    s = 12345;
  };
  return fn;
}

/** 数値を UnitTypeIndex にキャストするテスト用ヘルパー */
export function asType(n: number): UnitTypeIndex {
  return n as UnitTypeIndex;
}

/** spawnUnit() の PRNG 依存（angle, cooldown, wanderAngle）を固定値で確定的にユニットを生成する共通ヘルパー */
export function spawnAt(team: Team, type: UnitTypeIndex, x: number, y: number): UnitIndex {
  return spawnUnit(team, type, x, y, () => 0);
}

/** テスト用 killUnit ラッパー。大半のテストでは killContext を気にしないためデフォルトを提供 */
export function kill(i: UnitIndex, killer?: Killer, killContext: KillContext = KILL_CONTEXT.ProjectileDirect) {
  return killUnit(i, killer, killContext);
}
