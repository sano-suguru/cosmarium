import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit, resetPoolCounts } from '../pools.ts';
import { beams, rng } from '../state.ts';
import { TEAMS } from '../types.ts';
import { unitTypeIndex } from '../unit-types.ts';
import { spawnUnit } from './spawn.ts';

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
  { type: T('Ram'), count: 3, spread: 400 },
  { type: T('Missile'), count: 3, spread: 500 },
  { type: T('EMP'), count: 2, spread: 400 },
  { type: T('Beam Frig.'), count: 3, spread: 400 },
  { type: T('Teleporter'), count: 2, spread: 400 },
  { type: T('Chain Bolt'), count: 2, spread: 400 },
];

export function initUnits() {
  for (let i = 0; i < POOL_UNITS; i++) getUnit(i).alive = false;
  for (let i = 0; i < POOL_PARTICLES; i++) getParticle(i).alive = false;
  for (let i = 0; i < POOL_PROJECTILES; i++) getProjectile(i).alive = false;
  resetPoolCounts();
  beams.length = 0;

  for (const team of TEAMS) {
    const cx = team === 0 ? -1200 : 1200;
    const cy = team === 0 ? -300 : 300;
    for (const { type, count, spread } of INIT_SPAWNS) {
      for (let j = 0; j < count; j++) {
        spawnUnit(team, type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread);
      }
    }
  }
}
