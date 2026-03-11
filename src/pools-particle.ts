import { POOL_PARTICLES } from './constants.ts';
import { particleIdx } from './pool-index.ts';
import { particlePool } from './pools-init.ts';
import type { ParticleIndex } from './types.ts';
import { NO_PARTICLE } from './types.ts';

if (POOL_PARTICLES > 0xffff) {
  throw new RangeError('POOL_PARTICLES exceeds Uint16Array range (65535)');
}

const _particleFree = new Uint16Array(POOL_PARTICLES);
const _particleInFree = new Uint8Array(POOL_PARTICLES);
let _particleFreeTop = POOL_PARTICLES;

// テンプレート（モジュールスコープで1回だけ計算）— TypedArray bulk copy でリセット高速化
const _particleFreeTemplate = new Uint16Array(POOL_PARTICLES);
for (let i = 0; i < POOL_PARTICLES; i++) {
  _particleFreeTemplate[i] = POOL_PARTICLES - 1 - i;
}

export function initParticleFreeStack() {
  _particleFree.set(_particleFreeTemplate);
  _particleInFree.fill(1);
  _particleFreeTop = POOL_PARTICLES;
}
initParticleFreeStack();

export function allocParticleSlot(): ParticleIndex {
  if (_particleFreeTop === 0) {
    return NO_PARTICLE;
  }
  _particleFreeTop--;
  const v = _particleFree[_particleFreeTop] as number;
  if (particlePool[v]?.alive) {
    throw new RangeError('particle free stack corrupted');
  }
  _particleInFree[v] = 0;
  return particleIdx(v);
}

export function freeParticleSlot(i: ParticleIndex) {
  const raw = i as unknown as number;
  if (raw < 0 || raw >= POOL_PARTICLES) {
    throw new RangeError(`particle index out of range: ${raw}`);
  }
  if (particlePool[raw]?.alive) {
    throw new RangeError(`particle slot ${raw} is still alive`);
  }
  if (_particleInFree[raw]) {
    throw new RangeError(`particle slot ${raw} already in free stack`);
  }
  if (_particleFreeTop >= POOL_PARTICLES) {
    throw new RangeError('particle free stack overflow');
  }
  _particleFree[_particleFreeTop] = raw;
  _particleFreeTop++;
  _particleInFree[raw] = 1;
}

export function rebuildParticleFreeStack() {
  _particleFreeTop = 0;
  _particleInFree.fill(0);
  for (let i = POOL_PARTICLES - 1; i >= 0; i--) {
    if (!particlePool[i]?.alive) {
      _particleFree[_particleFreeTop] = i;
      _particleFreeTop++;
      _particleInFree[i] = 1;
    }
  }
}
