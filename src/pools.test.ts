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
  teamUnitCounts,
  unit,
} from './pools.ts';

afterEach(() => {
  resetPoolCounts();
  vi.restoreAllMocks();
});

describe('incUnits / decUnits', () => {
  it('1回インクリメントでカウント+1', () => {
    incUnits(0);
    expect(poolCounts.units).toBe(1);
  });

  it('POOL_UNITS到達でRangeError', () => {
    setUnitCount(POOL_UNITS);
    expect(() => incUnits(0)).toThrow(RangeError);
  });

  it('0の状態でdecUnitsはRangeError', () => {
    expect(() => decUnits(0)).toThrow(RangeError);
  });
});

describe('incParticles / decParticles', () => {
  it('1回インクリメントでカウント+1', () => {
    incParticles();
    expect(poolCounts.particles).toBe(1);
  });

  it('POOL_PARTICLES到達でRangeError', () => {
    for (let i = 0; i < POOL_PARTICLES; i++) incParticles();
    expect(() => incParticles()).toThrow(RangeError);
  });

  it('0の状態でdecParticlesはRangeError', () => {
    expect(() => decParticles()).toThrow(RangeError);
  });
});

describe('incProjectiles / decProjectiles', () => {
  it('1回インクリメントでカウント+1', () => {
    incProjectiles();
    expect(poolCounts.projectiles).toBe(1);
  });

  it('POOL_PROJECTILES到達でRangeError', () => {
    for (let i = 0; i < POOL_PROJECTILES; i++) incProjectiles();
    expect(() => incProjectiles()).toThrow(RangeError);
  });

  it('0の状態でdecProjectilesはRangeError', () => {
    expect(() => decProjectiles()).toThrow(RangeError);
  });
});

describe('unit / particle / projectile', () => {
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
    incUnits(0);
    incParticles();
    incProjectiles();
    resetPoolCounts();
    expect(poolCounts.units).toBe(0);
    expect(poolCounts.particles).toBe(0);
    expect(poolCounts.projectiles).toBe(0);
  });
});

describe('setUnitCount', () => {
  it('任意の値に設定できる', () => {
    setUnitCount(42);
    expect(poolCounts.units).toBe(42);
  });

  it('POOL_UNITS に設定可能', () => {
    setUnitCount(POOL_UNITS);
    expect(poolCounts.units).toBe(POOL_UNITS);
  });

  it('POOL_UNITS に設定後 incUnits は RangeError', () => {
    setUnitCount(POOL_UNITS);
    expect(() => incUnits(0)).toThrow(RangeError);
  });

  it('負値に設定後 decUnits は RangeError', () => {
    setUnitCount(-1);
    expect(() => decUnits(0)).toThrow(RangeError);
  });

  it('setUnitCount 後 teamUnitCounts が [0,0] にリセットされる', () => {
    incUnits(0);
    incUnits(1);
    setUnitCount(10);
    expect(teamUnitCounts[0]).toBe(0);
    expect(teamUnitCounts[1]).toBe(0);
  });
});

describe('setPoolCounts', () => {
  it('有効な値でカウントを一括設定', () => {
    setPoolCounts(10, 20, 30, [5, 5]);
    expect(poolCounts.units).toBe(10);
    expect(poolCounts.particles).toBe(20);
    expect(poolCounts.projectiles).toBe(30);
    expect(teamUnitCounts[0]).toBe(5);
    expect(teamUnitCounts[1]).toBe(5);
  });

  it('上限値で設定可能', () => {
    setPoolCounts(POOL_UNITS, POOL_PARTICLES, POOL_PROJECTILES, [POOL_UNITS, 0]);
    expect(poolCounts.units).toBe(POOL_UNITS);
    expect(poolCounts.particles).toBe(POOL_PARTICLES);
    expect(poolCounts.projectiles).toBe(POOL_PROJECTILES);
  });

  it('0で設定可能', () => {
    setPoolCounts(0, 0, 0, [0, 0]);
    expect(poolCounts.units).toBe(0);
    expect(poolCounts.particles).toBe(0);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('unitCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(-1, 0, 0, [0, 0])).toThrow(RangeError);
    expect(() => setPoolCounts(POOL_UNITS + 1, 0, 0, [0, 0])).toThrow(RangeError);
  });

  it('particleCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(0, -1, 0, [0, 0])).toThrow(RangeError);
    expect(() => setPoolCounts(0, POOL_PARTICLES + 1, 0, [0, 0])).toThrow(RangeError);
  });

  it('projectileCount が範囲外で RangeError', () => {
    expect(() => setPoolCounts(0, 0, -1, [0, 0])).toThrow(RangeError);
    expect(() => setPoolCounts(0, 0, POOL_PROJECTILES + 1, [0, 0])).toThrow(RangeError);
  });

  it('teamUnits 合計が units と不一致で RangeError', () => {
    expect(() => setPoolCounts(10, 0, 0, [3, 3])).toThrow(RangeError);
    expect(() => setPoolCounts(10, 0, 0, [0, 0])).toThrow(RangeError);
    expect(() => setPoolCounts(0, 0, 0, [1, 0])).toThrow(RangeError);
  });

  it('teamUnits に負値で RangeError', () => {
    expect(() => setPoolCounts(10, 0, 0, [-1, 11])).toThrow(RangeError);
    expect(() => setPoolCounts(10, 0, 0, [11, -1])).toThrow(RangeError);
  });
});

describe('teamUnitCounts', () => {
  it('incUnits/decUnits で per-team カウントが増減する', () => {
    incUnits(0);
    incUnits(0);
    incUnits(1);
    expect(teamUnitCounts[0]).toBe(2);
    expect(teamUnitCounts[1]).toBe(1);
    expect(poolCounts.units).toBe(3);
    decUnits(0);
    expect(teamUnitCounts[0]).toBe(1);
    expect(poolCounts.units).toBe(2);
  });

  it('resetPoolCounts で per-team カウントもリセットされる', () => {
    incUnits(0);
    incUnits(1);
    resetPoolCounts();
    expect(teamUnitCounts[0]).toBe(0);
    expect(teamUnitCounts[1]).toBe(0);
  });

  it('チーム別カウントが0の状態で decUnits は RangeError', () => {
    incUnits(1);
    expect(() => decUnits(0)).toThrow(RangeError);
  });
});
