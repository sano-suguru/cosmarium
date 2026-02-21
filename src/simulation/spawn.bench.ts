import { afterEach, bench, describe } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { SH_CIRCLE } from '../constants.ts';
import type { ParticleIndex } from '../types.ts';
import { NO_PARTICLE } from '../types.ts';
import { killParticle, killUnit, spawnParticle, spawnUnit } from './spawn.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('spawnParticle', () => {
  bench('spawn 1 particle (空プール)', () => {
    const idx = spawnParticle(0, 0, 1, 0, 0.5, 2, 1, 1, 1, SH_CIRCLE);
    if (idx !== NO_PARTICLE) killParticle(idx);
  });

  bench('spawn + kill 100 cycle', () => {
    const buf: ParticleIndex[] = [];
    for (let i = 0; i < 100; i++) {
      const idx = spawnParticle(i, i, 1, 0, 0.5, 2, 1, 1, 1, SH_CIRCLE);
      buf.push(idx);
    }
    for (const idx of buf) {
      if (idx !== NO_PARTICLE) killParticle(idx);
    }
  });
});

describe('spawnUnit', () => {
  const rng = () => 0.5;

  bench('spawn 1 unit (空プール)', () => {
    const idx = spawnUnit(0, 1, 100, 200, rng);
    killUnit(idx);
  });
});
