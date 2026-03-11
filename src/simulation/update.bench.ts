import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { asType, makeGameLoopState, makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { REF_FPS, SH_CIRCLE } from '../constants.ts';
import type { ParticleIndex } from '../types.ts';
import { spawnParticle } from './spawn.ts';
import { stepOnce } from './update.ts';

const rng = makeRng();
const shake = () => undefined;
const gameLoopState = makeGameLoopState();

function spawnParticles(n: number) {
  for (let i = 0; i < n; i++) {
    spawnParticle(rng() * 4000, rng() * 4000, rng() - 0.5, rng() - 0.5, 1, 2, 1, 1, 1, SH_CIRCLE);
  }
}

describe('stepOnce 1tick', () => {
  const dt = 1 / REF_FPS;

  bench('空の世界 (0 units, 0 particles)', () => {
    rng.reset();
    stepOnce(dt, rng, gameLoopState, shake);
  });

  bench('50 units, 0 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, asType(1), rng() * 4000, rng() * 4000);
      spawnAt(1, asType(1), rng() * 4000, rng() * 4000);
    }
    stepOnce(dt, rng, gameLoopState, shake);
    resetPools();
  });

  bench('50 units, 1000 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, asType(1), rng() * 4000, rng() * 4000);
      spawnAt(1, asType(1), rng() * 4000, rng() * 4000);
    }
    spawnParticles(1000);
    stepOnce(dt, rng, gameLoopState, shake);
    resetPools();
  });

  bench('50 units, 10000 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, asType(1), rng() * 4000, rng() * 4000);
      spawnAt(1, asType(1), rng() * 4000, rng() * 4000);
    }
    spawnParticles(10000);
    stepOnce(dt, rng, gameLoopState, shake);
    resetPools();
  });

  bench('200 units, 10000 particles', () => {
    rng.reset();
    for (let i = 0; i < 100; i++) {
      spawnAt(0, asType(1), rng() * 4000, rng() * 4000);
      spawnAt(1, asType(1), rng() * 4000, rng() * 4000);
    }
    spawnParticles(10000);
    stepOnce(dt, rng, gameLoopState, shake);
    resetPools();
  });
});

describe('spawnParticle batch', () => {
  bench('spawn 1000 particles 連続', () => {
    const buf: ParticleIndex[] = [];
    for (let i = 0; i < 1000; i++) {
      buf.push(spawnParticle(i, i, 1, 0, 0.5, 2, 1, 1, 1, SH_CIRCLE));
    }
    resetPools();
  });
});
