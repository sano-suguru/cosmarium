import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { unit } from '../pools.ts';
import { unitTypeIndex } from '../unit-type-accessors.ts';
import { combat } from './combat.ts';
import { buildHash } from './spatial-hash.ts';

const rng = makeRng();
const dt = 1 / 30;
const shake = () => undefined;

const FIGHTER = unitTypeIndex('Fighter');
const SCORCHER = unitTypeIndex('Scorcher');
const ARCER = unitTypeIndex('Arcer');
const CRUISER = unitTypeIndex('Cruiser');

describe('combat 武器タイプ別', () => {
  bench('Fighter (通常射撃)', () => {
    rng.reset();
    const a = spawnAt(0, FIGHTER, 2000, 2000);
    spawnAt(1, FIGHTER, 2050, 2000);
    buildHash();
    const u = unit(a);
    u.cooldown = 0;
    combat(u, a, dt, rng, 1, shake);
    resetPools();
  });

  bench('Scorcher (スイープビーム)', () => {
    rng.reset();
    const a = spawnAt(0, SCORCHER, 2000, 2000);
    spawnAt(1, FIGHTER, 2050, 2000);
    buildHash();
    const u = unit(a);
    u.cooldown = 0;
    combat(u, a, dt, rng, 1, shake);
    resetPools();
  });

  bench('Arcer (チェーンライトニング)', () => {
    rng.reset();
    const a = spawnAt(0, ARCER, 2000, 2000);
    for (let i = 0; i < 5; i++) {
      spawnAt(1, FIGHTER, 2050 + i * 30, 2000);
    }
    buildHash();
    const u = unit(a);
    u.cooldown = 0;
    combat(u, a, dt, rng, 1, shake);
    resetPools();
  });

  bench('Cruiser (ブロードサイド)', () => {
    rng.reset();
    const a = spawnAt(0, CRUISER, 2000, 2000);
    for (let i = 0; i < 5; i++) {
      spawnAt(1, FIGHTER, 2050 + i * 20, 2000 + i * 20);
    }
    buildHash();
    const u = unit(a);
    u.cooldown = 0;
    combat(u, a, dt, rng, 1, shake);
    resetPools();
  });
});
