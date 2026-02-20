import { afterEach, describe, expect, it, vi } from 'vitest';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from './constants.ts';
import {
  decParticles,
  decProjectiles,
  decUnits,
  incParticles,
  incProjectiles,
  incUnits,
  particle,
  poolCounts,
  projectile,
  resetPoolCounts,
  setPoolCounts,
  setUnitCount,
  unit,
} from './pools.ts';

afterEach(() => {
  resetPoolCounts();
  vi.restoreAllMocks();
});

describe('incUnitCount / decUnitCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incUnits();
    expect(poolCounts.units).toBe(1);
  });

  it('POOL_UNITS到達でRangeError', () => {
    setUnitCount(POOL_UNITS);
    expect(() => incUnits()).toThrow(RangeError);
  });

  it('0の状態でdecUnitCountはRangeError', () => {
    expect(() => decUnits()).toThrow(RangeError);
  });
});

describe('incParticleCount / decParticleCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incParticles();
    expect(poolCounts.particles).toBe(1);
  });

  it('POOL_PARTICLES到達でRangeError', () => {
    for (let i = 0; i < POOL_PARTICLES; i++) incParticles();
    expect(() => incParticles()).toThrow(RangeError);
  });

  it('0の状態でdecParticleCountはRangeError', () => {
    expect(() => decParticles()).toThrow(RangeError);
  });
});

describe('incProjectileCount / decProjectileCount', () => {
  it('1回インクリメントでカウント+1', () => {
    incProjectiles();
    expect(poolCounts.projectiles).toBe(1);
  });

  it('POOL_PROJECTILES到達でRangeError', () => {
    for (let i = 0; i < POOL_PROJECTILES; i++) incProjectiles();
    expect(() => incProjectiles()).toThrow(RangeError);
  });

  it('0の状態でdecProjectileCountはRangeError', () => {
    expect(() => decProjectiles()).toThrow(RangeError);
  });
});

describe('getUnit / getParticle / getProjectile', () => {
  it('有効インデックスでUnit返却', () => {
    const u = unit(0);
    expect(u).toBeDefined();
    expect(u).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (unit)', () => {
    expect(() => unit(-1)).toThrow(RangeError);
    expect(() => unit(POOL_UNITS)).toThrow(RangeError);
  });

  it('有効インデックスでParticle返却', () => {
    const p = particle(0);
    expect(p).toBeDefined();
    expect(p).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (particle)', () => {
    expect(() => particle(-1)).toThrow(RangeError);
    expect(() => particle(POOL_PARTICLES)).toThrow(RangeError);
  });

  it('有効インデックスでProjectile返却', () => {
    const p = projectile(0);
    expect(p).toBeDefined();
    expect(p).toHaveProperty('alive');
  });

  it('範囲外インデックスでRangeError (projectile)', () => {
    expect(() => projectile(-1)).toThrow(RangeError);
    expect(() => projectile(POOL_PROJECTILES)).toThrow(RangeError);
  });
});

describe('resetPoolCounts', () => {
  it('全カウントを0にリセット', () => {
    incUnits();
    incParticles();
    incProjectiles();
    resetPoolCounts();
    expect(poolCounts.units).toBe(0);
    expect(poolCounts.particles).toBe(0);
    expect(poolCounts.projectiles).toBe(0);
  });
});

describe('setUnitCountForTest', () => {
  it('任意の値に設定できる', () => {
    setUnitCount(42);
    expect(poolCounts.units).toBe(42);
  });

  it('POOL_UNITS に設定可能', () => {
    setUnitCount(POOL_UNITS);
    expect(poolCounts.units).toBe(POOL_UNITS);
  });

  it('POOL_UNITS に設定後 incUnitCount は RangeError', () => {
    setUnitCount(POOL_UNITS);
    expect(() => incUnits()).toThrow(RangeError);
  });

  it('負値に設定後 decUnitCount は RangeError', () => {
    setUnitCount(-1);
    expect(() => decUnits()).toThrow(RangeError);
  });
});

describe('setPoolCounts', () => {
  it('有効な値でカウントを一括設定', () => {
    setPoolCounts(10, 20, 30);
    expect(poolCounts.units).toBe(10);
    expect(poolCounts.particles).toBe(20);
    expect(poolCounts.projectiles).toBe(30);
  });

  it('上限値で設定可能', () => {
    setPoolCounts(POOL_UNITS, POOL_PARTICLES, POOL_PROJECTILES);
    expect(poolCounts.units).toBe(POOL_UNITS);
    expect(poolCounts.particles).toBe(POOL_PARTICLES);
    expect(poolCounts.projectiles).toBe(POOL_PROJECTILES);
  });

  it('0で設定可能', () => {
    setPoolCounts(0, 0, 0);
    expect(poolCounts.units).toBe(0);
    expect(poolCounts.particles).toBe(0);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('unitCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(-1, 0, 0)).toThrow(RangeError);
    expect(() => setPoolCounts(POOL_UNITS + 1, 0, 0)).toThrow(RangeError);
  });

  it('particleCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(0, -1, 0)).toThrow(RangeError);
    expect(() => setPoolCounts(0, POOL_PARTICLES + 1, 0)).toThrow(RangeError);
  });

  it('projectileCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(0, 0, -1)).toThrow(RangeError);
    expect(() => setPoolCounts(0, 0, POOL_PROJECTILES + 1)).toThrow(RangeError);
  });
});
