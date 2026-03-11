import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { unitTypeIndex } from '../unit-type-accessors.ts';
import { chainLightning, explosion } from './effects.ts';
import { buildHash } from './spatial-hash.ts';
import { captureKiller } from './spawn.ts';

const rng = makeRng();
const shake = () => undefined;
const FIGHTER = unitTypeIndex('Fighter');
const ARCER = unitTypeIndex('Arcer');

describe('explosion', () => {
  bench('小型 (Fighter)', () => {
    rng.reset();
    explosion(2000, 2000, 0, FIGHTER, rng, shake);
    resetPools();
  });

  bench('大型 (連続10回)', () => {
    rng.reset();
    for (let i = 0; i < 10; i++) {
      explosion(2000 + i * 100, 2000, 0, FIGHTER, rng, shake);
    }
    resetPools();
  });
});

describe('chainLightning', () => {
  bench('3ホップ', () => {
    rng.reset();
    const src = spawnAt(0, ARCER, 2000, 2000);
    for (let i = 0; i < 5; i++) {
      spawnAt(1, FIGHTER, 2050 + i * 40, 2000);
    }
    buildHash();
    const killer = captureKiller(src);
    if (killer) {
      chainLightning(2000, 2000, 0, 10, 3, [0.5, 0.8, 1], killer, rng, shake);
    }
    resetPools();
  });

  bench('6ホップ', () => {
    rng.reset();
    const src = spawnAt(0, ARCER, 2000, 2000);
    for (let i = 0; i < 10; i++) {
      spawnAt(1, FIGHTER, 2050 + i * 40, 2000);
    }
    buildHash();
    const killer = captureKiller(src);
    if (killer) {
      chainLightning(2000, 2000, 0, 10, 6, [0.5, 0.8, 1], killer, rng, shake);
    }
    resetPools();
  });
});
