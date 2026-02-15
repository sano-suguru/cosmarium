import { afterEach, describe, expect, it, vi } from 'vitest';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from './constants.ts';
import {
  decParticleCount,
  decProjectileCount,
  decUnitCount,
  getParticle,
  getProjectile,
  getUnit,
  incParticleCount,
  incProjectileCount,
  incUnitCount,
  poolCounts,
  resetPoolCounts,
  setUnitCountForTest,
} from './pools.ts';

afterEach(() => {
  resetPoolCounts();
  vi.restoreAllMocks();
});

describe('incUnitCount / decUnitCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incUnitCount();
    expect(poolCounts.unitCount).toBe(1);
  });

  it('POOL_UNITS到達でRangeError', () => {
    setUnitCountForTest(POOL_UNITS);
    expect(() => incUnitCount()).toThrow(RangeError);
  });

  it('0の状態でdecUnitCountはRangeError', () => {
    expect(() => decUnitCount()).toThrow(RangeError);
  });
});

describe('incParticleCount / decParticleCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incParticleCount();
    expect(poolCounts.particleCount).toBe(1);
  });

  it('POOL_PARTICLES到達でRangeError', () => {
    for (let i = 0; i < POOL_PARTICLES; i++) incParticleCount();
    expect(() => incParticleCount()).toThrow(RangeError);
  });

  it('0の状態でdecParticleCountはRangeError', () => {
    expect(() => decParticleCount()).toThrow(RangeError);
  });
});

describe('incProjectileCount / decProjectileCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incProjectileCount();
    expect(poolCounts.projectileCount).toBe(1);
  });

  it('POOL_PROJECTILES到達でRangeError', () => {
    for (let i = 0; i < POOL_PROJECTILES; i++) incProjectileCount();
    expect(() => incProjectileCount()).toThrow(RangeError);
  });

  it('0の状態でdecProjectileCountはRangeError', () => {
    expect(() => decProjectileCount()).toThrow(RangeError);
  });
});

describe('getUnit / getParticle / getProjectile', () => {
  it('有効インデックスでUnit返却', () => {
    const u = getUnit(0);
    expect(u).toBeDefined();
    expect(u).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (unit)', () => {
    expect(() => getUnit(-1)).toThrow(RangeError);
    expect(() => getUnit(POOL_UNITS)).toThrow(RangeError);
  });

  it('有効インデックスでParticle返却', () => {
    const p = getParticle(0);
    expect(p).toBeDefined();
    expect(p).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (particle)', () => {
    expect(() => getParticle(-1)).toThrow(RangeError);
    expect(() => getParticle(POOL_PARTICLES)).toThrow(RangeError);
  });

  it('有効インデックスでProjectile返却', () => {
    const p = getProjectile(0);
    expect(p).toBeDefined();
    expect(p).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (projectile)', () => {
    expect(() => getProjectile(-1)).toThrow(RangeError);
    expect(() => getProjectile(POOL_PROJECTILES)).toThrow(RangeError);
  });
});

describe('resetPoolCounts', () => {
  it('全カウントを0にリセット', () => {
    incUnitCount();
    incParticleCount();
    incProjectileCount();
    resetPoolCounts();
    expect(poolCounts.unitCount).toBe(0);
    expect(poolCounts.particleCount).toBe(0);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

describe('setUnitCountForTest', () => {
  it('任意の値に設定できる', () => {
    setUnitCountForTest(42);
    expect(poolCounts.unitCount).toBe(42);
  });

  it('POOL_UNITS に設定可能', () => {
    setUnitCountForTest(POOL_UNITS);
    expect(poolCounts.unitCount).toBe(POOL_UNITS);
  });

  it('POOL_UNITS に設定後 incUnitCount は RangeError', () => {
    setUnitCountForTest(POOL_UNITS);
    expect(() => incUnitCount()).toThrow(RangeError);
  });

  it('負値に設定後 decUnitCount は RangeError', () => {
    setUnitCountForTest(-1);
    expect(() => decUnitCount()).toThrow(RangeError);
  });
});
