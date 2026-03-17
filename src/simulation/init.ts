import { clearAllPools, getUnitHWM, mothershipIdx, registerMothership } from '../pools.ts';
import type { Team, TeamTuple } from '../team.ts';
import { teamsOf } from '../team.ts';
import type { UnitTypeIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import type { FleetSetup, ProductionState } from '../types-fleet.ts';
import {
  AMPLIFIER_TYPE,
  ARCER_TYPE,
  ASTEROID_LARGE_TYPE,
  ASTEROID_TYPE,
  BASTION_TYPE,
  BOMBER_TYPE,
  CARRIER_TYPE,
  CATALYST_TYPE,
  CRUISER_TYPE,
  DISRUPTOR_TYPE,
  DRONE_TYPE,
  FIGHTER_TYPE,
  FLAGSHIP_TYPE,
  HEALER_TYPE,
  HIVE_TYPE,
  LANCER_TYPE,
  LAUNCHER_TYPE,
  REFLECTOR_TYPE,
  SCORCHER_TYPE,
  SCRAMBLER_TYPE,
  SNIPER_TYPE,
  TELEPORTER_TYPE,
  unitType,
} from '../unit-type-accessors.ts';
import { resetChains } from './chain-lightning.ts';
import { emptyProductions, initProductionState } from './production.ts';
import { spawnUnit } from './spawn.ts';
import { battleOrigin, meleeOrigin } from './spawn-coordinates.ts';
import { formSquadrons } from './squadron.ts';

interface InitSpawn {
  readonly type: UnitTypeIndex;
  readonly count: number;
  readonly spread: number;
}

export const INIT_SPAWNS: readonly InitSpawn[] = [
  { type: FLAGSHIP_TYPE, count: 2, spread: 200 },
  { type: CARRIER_TYPE, count: 1, spread: 150 },
  { type: CRUISER_TYPE, count: 4, spread: 500 },
  { type: BOMBER_TYPE, count: 3, spread: 400 },
  { type: FIGHTER_TYPE, count: 20, spread: 700 },
  { type: DRONE_TYPE, count: 65, spread: 900 },
  { type: HEALER_TYPE, count: 3, spread: 400 },
  { type: REFLECTOR_TYPE, count: 2, spread: 300 },
  { type: SNIPER_TYPE, count: 4, spread: 600 },
  { type: LANCER_TYPE, count: 3, spread: 400 },
  { type: LAUNCHER_TYPE, count: 3, spread: 500 },
  { type: DISRUPTOR_TYPE, count: 2, spread: 400 },
  { type: SCORCHER_TYPE, count: 3, spread: 400 },
  { type: TELEPORTER_TYPE, count: 2, spread: 400 },
  { type: ARCER_TYPE, count: 2, spread: 400 },
  { type: BASTION_TYPE, count: 2, spread: 400 },
  { type: AMPLIFIER_TYPE, count: 2, spread: 400 },
  { type: SCRAMBLER_TYPE, count: 2, spread: 400 },
  { type: CATALYST_TYPE, count: 2, spread: 400 },
];

function resetField() {
  clearAllPools();
  resetChains();
}

export function initUnits(rng: () => number) {
  resetField();

  for (const team of [0, 1] as const) {
    const [cx, cy] = battleOrigin(team);
    spawnMothership(team, cx, cy, rng, HIVE_TYPE);
    for (const { type, count, spread } of INIT_SPAWNS) {
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
    formSquadrons(team, getUnitHWM());
  }
}

function spawnMothership(team: Team, cx: number, cy: number, rng: () => number, mothershipType: UnitTypeIndex) {
  if (mothershipIdx[team] !== NO_UNIT) {
    return;
  }
  const idx = spawnUnit(team, mothershipType, cx, cy, rng);
  if (idx === NO_UNIT) {
    throw new RangeError(`Failed to spawn mothership for team ${team}: unit pool exhausted`);
  }
  registerMothership(team, idx, mothershipType);
}

/** 母艦のみスポーン（生産駆動バトル用） */
export function initBattleProduction(
  rng: () => number,
  playerSetup: FleetSetup,
  enemySetup: FleetSetup,
): [ProductionState, ProductionState] {
  resetField();
  const [cx0, cy0] = battleOrigin(0);
  spawnMothership(0, cx0, cy0, rng, playerSetup.mothershipType);
  const [cx1, cy1] = battleOrigin(1);
  spawnMothership(1, cx1, cy1, rng, enemySetup.mothershipType);
  return [initProductionState(playerSetup.slots), initProductionState(enemySetup.slots)];
}

/** N勢力の母艦のみ円周配置でスポーン（生産駆動メレー用） */
export function initMeleeProduction(
  rng: () => number,
  setups: readonly FleetSetup[],
  numTeams: number,
): TeamTuple<ProductionState> {
  resetField();
  const productions = emptyProductions();
  for (const team of teamsOf(numTeams)) {
    const setup = setups[team];
    if (setup) {
      const [cx, cy] = meleeOrigin(team, numTeams);
      spawnMothership(team, cx, cy, rng, setup.mothershipType);
      productions[team] = initProductionState(setup.slots);
    }
  }
  return productions;
}

/** 小アステロイド配置数 */
const BONUS_SMALL_COUNT = 25;
/** 大アステロイドコア配置数 */
const BONUS_LARGE_COUNT = 4;
/** アステロイド散布半径（battleOrigin 基準） */
const BONUS_SPREAD = 1600;
/** 大アステロイドの散布倍率（中央に寄せる） */
const BONUS_LARGE_SPREAD_MUL = 0.6;

interface BonusFieldInfo {
  readonly totalHp: number;
  readonly playerProduction: ProductionState;
}

/**
 * ボーナスラウンドのフィールドを初期化する。
 * プレイヤー母艦 + アステロイド配置（敵母艦なし）。
 */
export function initBonusField(rng: () => number, playerSetup: FleetSetup): BonusFieldInfo {
  resetField();

  // プレイヤー母艦（team 0）
  const [cx0, cy0] = battleOrigin(0);
  spawnMothership(0, cx0, cy0, rng, playerSetup.mothershipType);

  // アステロイド配置（team 1 = プレイヤーの攻撃対象）
  const [cx1, cy1] = battleOrigin(1);
  const asteroidHp = unitType(ASTEROID_TYPE).hp;
  const largeHp = unitType(ASTEROID_LARGE_TYPE).hp;
  const largeSpread = BONUS_SPREAD * BONUS_LARGE_SPREAD_MUL;

  for (let i = 0; i < BONUS_SMALL_COUNT; i++) {
    spawnUnit(1, ASTEROID_TYPE, cx1 + (rng() - 0.5) * BONUS_SPREAD, cy1 + (rng() - 0.5) * BONUS_SPREAD, rng);
  }
  for (let i = 0; i < BONUS_LARGE_COUNT; i++) {
    spawnUnit(1, ASTEROID_LARGE_TYPE, cx1 + (rng() - 0.5) * largeSpread, cy1 + (rng() - 0.5) * largeSpread, rng);
  }

  const totalHp = BONUS_SMALL_COUNT * asteroidHp + BONUS_LARGE_COUNT * largeHp;
  const playerProduction = initProductionState(playerSetup.slots);
  return { totalHp, playerProduction };
}
