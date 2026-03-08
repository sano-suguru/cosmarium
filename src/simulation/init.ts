import { clearAllPools, getUnitHWM, incMotherships, mothershipIdx } from '../pools.ts';
import type { BattleTeam, FleetComposition, Team, UnitTypeIndex } from '../types.ts';
import { NO_UNIT, TEAM0, TEAM1, teamsOf } from '../types.ts';
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
} from '../unit-types.ts';
import { resetChains } from './effects.ts';
import { spawnUnit } from './spawn.ts';
import { battleOrigin, meleeOrigin } from './spawn-coordinates.ts';
import { formSquadrons } from './squadron.ts';

const BATTLE_SPREAD_BASE = 400;
const BATTLE_SPREAD_PER_UNIT = 4;

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

function spawnMothership(team: Team, cx: number, cy: number, rng: () => number) {
  if (mothershipIdx[team] !== NO_UNIT) {
    return;
  }
  const idx = spawnUnit(team, MOTHERSHIP_TYPE, cx, cy, rng);
  if (idx === NO_UNIT) {
    throw new RangeError(`Failed to spawn mothership for team ${team}: unit pool exhausted`);
  }
  incMotherships(team, idx);
}

/** FleetComposition ベースで両チームをスポーンする（バトルモード用） */
export function initBattle(playerFleet: FleetComposition, enemyFleet: FleetComposition, rng: () => number) {
  resetField();

  for (const team of [0, 1] as const) {
    const [cx, cy] = battleOrigin(team);
    spawnMothership(team, cx, cy, rng);
  }

  const spawn = (team: BattleTeam, fleet: FleetComposition) => {
    const [cx, cy] = battleOrigin(team);
    for (const { type, count } of fleet) {
      const spread = BATTLE_SPREAD_BASE + count * BATTLE_SPREAD_PER_UNIT;
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
  };

  spawn(0, playerFleet);
  spawn(1, enemyFleet);

  const hwm = getUnitHWM();
  formSquadrons(TEAM0, hwm);
  formSquadrons(TEAM1, hwm);
}

/** N勢力を円周配置でスポーンする（MELEEモード用） */
export function initMelee(fleets: readonly FleetComposition[], rng: () => number) {
  resetField();
  const numTeams = fleets.length;
  for (const team of teamsOf(numTeams)) {
    const [cx, cy] = meleeOrigin(team, numTeams);
    spawnMothership(team, cx, cy, rng);
    const fleet = fleets[team];
    if (!fleet) {
      continue;
    }
    for (const { type, count } of fleet) {
      const spread = BATTLE_SPREAD_BASE + count * BATTLE_SPREAD_PER_UNIT;
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
    formSquadrons(team, getUnitHWM());
  }
}
