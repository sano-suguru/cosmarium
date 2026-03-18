import { afterEach, describe, expect, it, vi } from 'vitest';
import { asType, resetPools, resetState, spawnAt } from './__test__/pool-helper.ts';
import { beams, trackingBeams } from './beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, SH_CIRCLE } from './constants.ts';
import { unitIdx } from './pool-index.ts';
import {
  clearAllPools,
  countAliveMotherships,
  decParticles,
  decProjectiles,
  decUnits,
  getParticleHWM,
  getProjectileHWM,
  getUnitHWM,
  incParticles,
  incProjectiles,
  incUnits,
  mothershipIdx,
  mothershipType,
  poolCounts,
  registerMothership,
  resetPoolCounts,
  setUnitCount,
  teamUnitCounts,
} from './pools.ts';
import { particle, projectile, squadron, unit } from './pools-query.ts';
import { spawnParticle, spawnProjectile } from './simulation/spawn.ts';
import { addBeam } from './simulation/spawn-beams.ts';
import { assignToSquadron } from './simulation/squadron.ts';
import { TEAMS } from './team.ts';
import { NO_TYPE, NO_UNIT } from './types.ts';

afterEach(() => {
  resetPools();
  resetState();
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
    for (let i = 0; i < POOL_PARTICLES; i++) {
      incParticles();
    }
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
    for (let i = 0; i < POOL_PROJECTILES; i++) {
      incProjectiles();
    }
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

  it('リセット後に全チームの mothershipType が NO_TYPE', () => {
    resetPoolCounts();
    for (const t of TEAMS) {
      expect(mothershipType[t]).toBe(NO_TYPE);
    }
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

describe('countAliveMotherships', () => {
  it('母艦なしで0を返す', () => {
    expect(countAliveMotherships(2)).toBe(0);
  });

  it('2チーム中1体生存で1を返す', () => {
    unit(0).alive = true;
    incUnits(0);
    registerMothership(0, unitIdx(0), NO_TYPE);
    expect(countAliveMotherships(2)).toBe(1);
  });

  it('2チーム中2体生存で2を返す', () => {
    unit(0).alive = true;
    incUnits(0);
    registerMothership(0, unitIdx(0), NO_TYPE);
    unit(1).alive = true;
    incUnits(1);
    registerMothership(1, unitIdx(1), NO_TYPE);
    expect(countAliveMotherships(2)).toBe(2);
  });

  it('母艦が dead なら数えない', () => {
    unit(0).alive = true;
    incUnits(0);
    registerMothership(0, unitIdx(0), NO_TYPE);
    unit(1).alive = true;
    incUnits(1);
    registerMothership(1, unitIdx(1), NO_TYPE);
    // team 1 の母艦を撃沈
    unit(1).alive = false;
    expect(countAliveMotherships(2)).toBe(1);
  });
});

describe('clearAllPools', () => {
  it('全プールをクリアする', () => {
    // unit を生成
    spawnAt(0, asType(0), 100, 100);
    spawnAt(1, asType(0), 200, 200);

    // particle を生成
    spawnParticle(10, 10, 1, 1, 60, 2, 1, 1, 1, SH_CIRCLE);

    // projectile を生成
    spawnProjectile(50, 50, 2, 2, 30, 10, 0, 3, 1, 0.5, 0.5);

    // beam を追加
    addBeam(0, 0, 100, 100, 1, 1, 1, 30, 2);

    // 事前確認: 何かが存在する
    expect(poolCounts.units).toBeGreaterThan(0);
    expect(poolCounts.particles).toBeGreaterThan(0);
    expect(poolCounts.projectiles).toBeGreaterThan(0);
    expect(getUnitHWM()).toBeGreaterThan(0);
    expect(beams.length).toBeGreaterThan(0);

    clearAllPools();

    // 全 alive スロットが false
    for (let i = 0; i < 2; i++) {
      expect(unit(i).alive).toBe(false);
    }
    expect(particle(0).alive).toBe(false);
    expect(projectile(0).alive).toBe(false);

    // poolCounts が 0
    expect(poolCounts.units).toBe(0);
    expect(poolCounts.particles).toBe(0);
    expect(poolCounts.projectiles).toBe(0);

    // teamUnitCounts が全チーム 0
    for (const t of TEAMS) {
      expect(teamUnitCounts[t]).toBe(0);
    }

    // mothershipIdx / mothershipType がリセット
    for (const t of TEAMS) {
      expect(mothershipIdx[t]).toBe(NO_UNIT);
      expect(mothershipType[t]).toBe(NO_TYPE);
    }

    // HWM が 0
    expect(getUnitHWM()).toBe(0);
    expect(getParticleHWM()).toBe(0);
    expect(getProjectileHWM()).toBe(0);

    // beams / trackingBeams が空
    expect(beams.length).toBe(0);
    expect(trackingBeams.length).toBe(0);
  });

  it('squadron もクリアされる', () => {
    const idx = spawnAt(0, asType(0), 100, 100);
    assignToSquadron(idx, 0);

    // squadron が生成されたことを確認
    expect(squadron(0).alive).toBe(true);
    expect(squadron(0).memberCount).toBeGreaterThan(0);

    clearAllPools();

    expect(squadron(0).alive).toBe(false);
    expect(squadron(0).memberCount).toBe(0);
  });
});
