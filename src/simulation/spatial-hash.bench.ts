import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { buildHash, getNeighbors } from './spatial-hash.ts';

const rng = makeRng();

function spawnUnits(n: number) {
  for (let i = 0; i < n; i++) {
    spawnAt(i % 2 === 0 ? 0 : 1, 1, rng() * 4000, rng() * 4000);
  }
}

describe('buildHash', () => {
  bench('50 units', () => {
    spawnUnits(50);
    buildHash();
    resetPools();
  });

  bench('200 units', () => {
    spawnUnits(200);
    buildHash();
    resetPools();
  });

  bench('500 units', () => {
    spawnUnits(500);
    buildHash();
    resetPools();
  });
});

describe('getNeighbors', () => {
  bench('sparse (50 units, r=200)', () => {
    spawnUnits(50);
    buildHash();
    getNeighbors(2000, 2000, 200);
    resetPools();
  });

  bench('dense (500 units, r=200)', () => {
    spawnUnits(500);
    buildHash();
    getNeighbors(2000, 2000, 200);
    resetPools();
  });
});
