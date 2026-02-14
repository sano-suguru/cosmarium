import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { getParticle, getProjectile, getUnit, resetPoolCounts } from '../pools.ts';
import { asteroids, bases, beams, state } from '../state.ts';
import { TEAMS } from '../types.ts';
import { spawnUnit } from './spawn.ts';

function genAsteroids() {
  asteroids.length = 0;
  for (let i = 0; i < 40; i++) {
    asteroids.push({
      x: (Math.random() - 0.5) * WORLD_SIZE * 1.4,
      y: (Math.random() - 0.5) * WORLD_SIZE * 1.4,
      radius: 20 + Math.random() * 60,
      angle: Math.random() * 6.28,
      angularVelocity: (0.02 + Math.random() * 0.03) * (Math.random() < 0.5 ? 1 : -1),
    });
  }
}

export function initUnits() {
  for (let i = 0; i < POOL_UNITS; i++) getUnit(i).alive = false;
  for (let i = 0; i < POOL_PARTICLES; i++) getParticle(i).alive = false;
  for (let i = 0; i < POOL_PROJECTILES; i++) getProjectile(i).alive = false;
  resetPoolCounts();
  beams.length = 0;
  bases[0].hp = bases[0].maxHp;
  bases[1].hp = bases[1].maxHp;
  genAsteroids();

  const n = [2, 1, 4, 3, 20, 50, 3, 2, 4, 3, 3, 2, 3, 2, 2];
  if (state.gameMode === 1) {
    for (let i = 0; i < n.length; i++) {
      const v = n[i];
      if (v === undefined) throw new RangeError(`Invalid n index: ${i}`);
      n[i] = Math.ceil(v * 0.7);
    }
  }

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
