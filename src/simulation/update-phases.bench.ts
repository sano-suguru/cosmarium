import { bench, describe } from 'vitest';
import '../__test__/bench-helper.ts';
import { asType, makeGameLoopState, makeRng, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { REF_FPS, SH_CIRCLE } from '../constants.ts';
import { updateChains } from './chain-lightning.ts';
import { resetReflected } from './combat-reflect.ts';
import { buildHash } from './spatial-hash.ts';
import { spawnParticle, spawnProjectile } from './spawn.ts';
import { stepOnce } from './update.ts';
import { applyAllFields } from './update-fields.ts';
import { decayAndRegen } from './update-fields-regen.ts';
import { updateProjectiles } from './update-projectiles.ts';
import { updateBeams, updateParticles, updateTrackingBeams } from './update-vfx.ts';

const rng = makeRng();
const shake = () => undefined;
const dt = 1 / REF_FPS;

function setupWorld(units: number, particles: number, projectiles: number) {
  rng.reset();
  for (let i = 0; i < units; i++) {
    spawnAt(i % 2 === 0 ? 0 : 1, asType(1), rng() * 4000, rng() * 4000);
  }
  for (let i = 0; i < particles; i++) {
    spawnParticle(rng() * 4000, rng() * 4000, rng() - 0.5, rng() - 0.5, 1, 2, 1, 1, 1, SH_CIRCLE);
  }
  for (let i = 0; i < projectiles; i++) {
    spawnProjectile(rng() * 4000, rng() * 4000, rng() * 2, rng() * 2, 1, 5, (i % 2) as 0 | 1, 3, 1, 0.5, 0);
  }
  buildHash();
}

describe('stepOnce フェーズ別 (200u/5Kp/100pr)', () => {
  bench('buildHash', () => {
    setupWorld(200, 5000, 100);
    buildHash();
    resetPools();
  });

  bench('resetReflected', () => {
    setupWorld(200, 5000, 100);
    resetReflected();
    resetPools();
  });

  bench('stepOnce (swarm+steer+combat+fields)', () => {
    setupWorld(200, 5000, 100);
    stepOnce(dt, rng, makeGameLoopState('battle'), shake);
    resetPools();
  });

  bench('applyAllFields', () => {
    setupWorld(200, 5000, 100);
    applyAllFields(dt);
    resetPools();
  });

  bench('decayAndRegen', () => {
    setupWorld(200, 5000, 100);
    decayAndRegen(dt);
    resetPools();
  });

  bench('updateProjectiles', () => {
    setupWorld(200, 5000, 100);
    updateProjectiles(dt, rng, shake);
    resetPools();
  });

  bench('updateParticles', () => {
    setupWorld(200, 5000, 100);
    updateParticles(dt);
    resetPools();
  });

  bench('updateBeams', () => {
    setupWorld(200, 5000, 100);
    updateBeams(dt);
    resetPools();
  });

  bench('updateChains', () => {
    setupWorld(200, 5000, 100);
    updateChains(dt, rng, shake);
    resetPools();
  });

  bench('updateTrackingBeams', () => {
    setupWorld(200, 5000, 100);
    updateTrackingBeams(dt);
    resetPools();
  });
});
