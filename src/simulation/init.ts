import { getVariantDef } from '../mothership-variants.ts';
import { clearAllPools, getUnitHWM, incMotherships, mothershipIdx, setMothershipVariant, unit } from '../pools.ts';
import type { FleetSetup, MothershipVariant, ProductionState, Team, TeamTuple, UnitTypeIndex } from '../types.ts';
import { NO_UNIT, teamsOf } from '../types.ts';
import {
  AMPLIFIER_TYPE,
  ARCER_TYPE,
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
  LANCER_TYPE,
  LAUNCHER_TYPE,
  MOTHERSHIP_TYPE,
  REFLECTOR_TYPE,
  SCORCHER_TYPE,
  SCRAMBLER_TYPE,
  SNIPER_TYPE,
  TELEPORTER_TYPE,
} from '../unit-type-accessors.ts';
import { resetChains } from './effects.ts';
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
    spawnMothership(team, cx, cy, rng);
    for (const { type, count, spread } of INIT_SPAWNS) {
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
    formSquadrons(team, getUnitHWM());
  }
}

function spawnMothership(team: Team, cx: number, cy: number, rng: () => number, variant?: MothershipVariant) {
  if (mothershipIdx[team] !== NO_UNIT) {
    return;
  }
  const idx = spawnUnit(team, MOTHERSHIP_TYPE, cx, cy, rng);
  if (idx === NO_UNIT) {
    throw new RangeError(`Failed to spawn mothership for team ${team}: unit pool exhausted`);
  }
  incMotherships(team, idx);
  if (variant !== undefined) {
    setMothershipVariant(team, variant);
    const def = getVariantDef(variant);
    const u = unit(idx);
    u.maxHp = Math.round(u.maxHp * def.hpMul);
    u.hp = u.maxHp;
  }
}

/** 母艦のみスポーン（生産駆動バトル用） */
export function initBattleProduction(
  rng: () => number,
  playerSetup: FleetSetup,
  enemySetup: FleetSetup,
): [ProductionState, ProductionState] {
  resetField();
  const [cx0, cy0] = battleOrigin(0);
  spawnMothership(0, cx0, cy0, rng, playerSetup.variant);
  const [cx1, cy1] = battleOrigin(1);
  spawnMothership(1, cx1, cy1, rng, enemySetup.variant);
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
      spawnMothership(team, cx, cy, rng, setup.variant);
      productions[team] = initProductionState(setup.slots);
    }
  }
  return productions;
}
