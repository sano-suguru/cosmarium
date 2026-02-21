import { afterEach, bench, describe, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { REF_FPS, SH_CIRCLE } from '../constants.ts';
import type { ParticleIndex } from '../types.ts';
import { spawnParticle } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  startGame: vi.fn(),
  initUI: vi.fn(),
}));

import { update } from './update.ts';

const rng = (() => {
  let s = 12345;
  const fn = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  fn.reset = () => {
    s = 12345;
  };
  return fn;
})();

const gameLoopState = {
  codexOpen: false,
  reinforcementTimer: 0,
  updateCodexDemo: (_dt: number) => undefined,
};

function spawnParticles(n: number) {
  for (let i = 0; i < n; i++) {
    spawnParticle(rng() * 4000, rng() * 4000, rng() - 0.5, rng() - 0.5, 1, 2, 1, 1, 1, SH_CIRCLE);
  }
}

afterEach(() => {
  resetPools();
  resetState();
  gameLoopState.reinforcementTimer = 0;
});

describe('update 1tick', () => {
  const dt = 1 / REF_FPS;

  bench('空の世界 (0 units, 0 particles)', () => {
    rng.reset();
    update(dt, 0, rng, gameLoopState);
  });

  bench('50 units, 0 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    update(dt, 0, rng, gameLoopState);
    resetPools();
  });

  bench('50 units, 1000 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    spawnParticles(1000);
    update(dt, 0, rng, gameLoopState);
    resetPools();
  });

  bench('50 units, 10000 particles', () => {
    rng.reset();
    for (let i = 0; i < 25; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    spawnParticles(10000);
    update(dt, 0, rng, gameLoopState);
    resetPools();
  });

  bench('200 units, 10000 particles', () => {
    rng.reset();
    for (let i = 0; i < 100; i++) {
      spawnAt(0, 1, rng() * 4000, rng() * 4000);
      spawnAt(1, 1, rng() * 4000, rng() * 4000);
    }
    spawnParticles(10000);
    update(dt, 0, rng, gameLoopState);
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
