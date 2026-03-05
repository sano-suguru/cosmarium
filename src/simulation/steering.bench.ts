import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { REF_FPS } from '../constants.ts';
import { unit } from '../pools.ts';
import type { UnitIndex } from '../types.ts';
import { buildHash } from './spatial-hash.ts';
import { steer } from './steering.ts';
import { updateUnits } from './update.ts';

const rng = makeRng();

describe('steer 単体', () => {
  const dt = 1 / REF_FPS;

  bench('孤立ユニット (敵なし)', () => {
    rng.reset();
    const idx = spawnAt(0, 1, 2000, 2000);
    buildHash();
    steer(unit(idx), idx as UnitIndex, dt, rng);
    resetPools();
  });

  bench('密集 (50 units)', () => {
    rng.reset();
    const first = spawnAt(0, 1, 2000 + rng() * 200, 2000 + rng() * 200);
    spawnAt(1, 1, 2000 + rng() * 200, 2000 + rng() * 200);
    for (let i = 1; i < 25; i++) {
      spawnAt(0, 1, 2000 + rng() * 200, 2000 + rng() * 200);
      spawnAt(1, 1, 2000 + rng() * 200, 2000 + rng() * 200);
    }
    buildHash();
    steer(unit(first), first as UnitIndex, dt, rng);
    resetPools();
  });
});

describe('updateUnits', () => {
  const dt = 1 / REF_FPS;

  bench('50 units', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    buildHash();
    updateUnits(dt, 0, rng);
    resetPools();
  });

  bench('200 units', () => {
    rng.reset();
    for (let i = 0; i < 100; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    buildHash();
    updateUnits(dt, 0, rng);
    resetPools();
  });
});
