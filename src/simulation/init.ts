import { TAU } from '../constants.ts';
import { clearAllPools } from '../pools.ts';
import type { FleetComposition, Team } from '../types.ts';
import { unitTypeIndex } from '../unit-types.ts';
import { resetChains } from './effects.ts';
import { generateEnemyFleet } from './enemy-fleet.ts';
import { spawnUnit } from './spawn.ts';

const BATTLE_SPAWN_X = 1200;
const BATTLE_SPAWN_Y = 300;
const BATTLE_SPREAD_BASE = 400;
const BATTLE_SPREAD_PER_UNIT = 4;

interface InitSpawn {
  readonly type: number;
  readonly count: number;
  readonly spread: number;
}

const T = unitTypeIndex;

export const INIT_SPAWNS: readonly InitSpawn[] = [
  { type: T('Flagship'), count: 2, spread: 200 },
  { type: T('Carrier'), count: 1, spread: 150 },
  { type: T('Cruiser'), count: 4, spread: 500 },
  { type: T('Bomber'), count: 3, spread: 400 },
  { type: T('Fighter'), count: 20, spread: 700 },
  { type: T('Drone'), count: 65, spread: 900 },
  { type: T('Healer'), count: 3, spread: 400 },
  { type: T('Reflector'), count: 2, spread: 300 },
  { type: T('Sniper'), count: 4, spread: 600 },
  { type: T('Lancer'), count: 3, spread: 400 },
  { type: T('Launcher'), count: 3, spread: 500 },
  { type: T('Disruptor'), count: 2, spread: 400 },
  { type: T('Scorcher'), count: 3, spread: 400 },
  { type: T('Teleporter'), count: 2, spread: 400 },
  { type: T('Arcer'), count: 2, spread: 400 },
  { type: T('Bastion'), count: 2, spread: 400 },
  { type: T('Amplifier'), count: 2, spread: 400 },
  { type: T('Scrambler'), count: 2, spread: 400 },
  { type: T('Catalyst'), count: 2, spread: 400 },
];

function resetField() {
  clearAllPools();
  resetChains();
}

function teamOrigin(team: Team): [number, number] {
  const sign = team === 0 ? -1 : 1;
  return [sign * BATTLE_SPAWN_X, sign * BATTLE_SPAWN_Y];
}

export function initUnits(rng: () => number) {
  resetField();

  for (let ti = 0; ti < 2; ti++) {
    const team = ti as Team;
    const [cx, cy] = teamOrigin(team);
    for (const { type, count, spread } of INIT_SPAWNS) {
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
  }
}

/** FleetComposition ベースで両チームをスポーンする（バトルモード用） */
export function initBattle(playerFleet: FleetComposition, enemyFleet: FleetComposition, rng: () => number) {
  resetField();

  const spawn = (team: Team, fleet: FleetComposition) => {
    const [cx, cy] = teamOrigin(team);
    for (const { type, count } of fleet) {
      const spread = BATTLE_SPREAD_BASE + count * BATTLE_SPREAD_PER_UNIT;
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
  };

  spawn(0, playerFleet);
  spawn(1, enemyFleet);
}

const MELEE_SPAWN_RADIUS = 1200;

/** N勢力を円周配置でスポーンする（MELEEモード用） */
export function initMelee(numTeams: number, budget: number, rng: () => number) {
  resetField();
  for (let t = 0; t < numTeams; t++) {
    const angle = (t / numTeams) * TAU;
    const cx = Math.cos(angle) * MELEE_SPAWN_RADIUS;
    const cy = Math.sin(angle) * MELEE_SPAWN_RADIUS;
    const team = t as Team;
    const { fleet } = generateEnemyFleet(budget, rng);
    for (const { type, count } of fleet) {
      const spread = BATTLE_SPREAD_BASE + count * BATTLE_SPREAD_PER_UNIT;
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
      }
    }
  }
}
