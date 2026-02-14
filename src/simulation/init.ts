import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit, resetPoolCounts } from '../pools.ts';
import { beams } from '../state.ts';
import { TEAMS } from '../types.ts';
import { spawnUnit } from './spawn.ts';

export function initUnits() {
  for (let i = 0; i < POOL_UNITS; i++) getUnit(i).alive = false;
  for (let i = 0; i < POOL_PARTICLES; i++) getParticle(i).alive = false;
  for (let i = 0; i < POOL_PROJECTILES; i++) getProjectile(i).alive = false;
  resetPoolCounts();
  beams.length = 0;

  const n = [2, 1, 4, 3, 20, 50, 3, 2, 4, 3, 3, 2, 3, 2, 2];
  for (const team of TEAMS) {
    const cx = team === 0 ? -1200 : 1200;
    const cy = team === 0 ? -300 : 300;
    const s = (tp: number, count: number, spread: number) => {
      for (let j = 0; j < count; j++) {
        spawnUnit(team, tp, cx + (Math.random() - 0.5) * spread, cy + (Math.random() - 0.5) * spread);
      }
    };
    const spawns: [number, number][] = [
      [4, 200],
      [7, 150],
      [3, 500],
      [2, 400],
      [1, 700],
      [0, 900],
      [5, 400],
      [6, 300],
      [8, 600],
      [9, 400],
      [10, 500],
      [11, 400],
      [12, 400],
      [13, 400],
      [14, 400],
    ];
    for (let k = 0; k < spawns.length; k++) {
      const sp = spawns[k];
      if (sp === undefined) throw new RangeError(`Invalid spawns index: ${k}`);
      const count = n[k];
      if (count === undefined) throw new RangeError(`Invalid n index: ${k}`);
      s(sp[0], count, sp[1]);
    }
  }
}
