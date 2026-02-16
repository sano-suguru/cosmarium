import { afterEach, describe, expect, it } from 'vitest';
import { fillParticlePool, fillProjectilePool, fillUnitPool, resetPools, resetState } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { beams } from '../state.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { addBeam, killParticle, killProjectile, killUnit, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('spawnParticle', () => {
  it('パーティクルを生成し poolCounts.particleCount が増加する', () => {
    const idx = spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, 0);
    expect(idx).toBe(0);
    expect(poolCounts.particleCount).toBe(1);
    const p = getParticle(0);
    expect(p.alive).toBe(true);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.vx).toBe(1);
    expect(p.vy).toBe(-1);
    expect(p.life).toBe(0.5);
    expect(p.maxLife).toBe(0.5);
    expect(p.size).toBe(3);
    expect(p.r).toBe(1);
    expect(p.g).toBe(0.5);
    expect(p.b).toBe(0);
    expect(p.shape).toBe(0);
  });

  it('複数生成で空きスロットを探索する', () => {
    const i1 = spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, 0);
    const i2 = spawnParticle(5, 5, 0, 0, 1, 1, 1, 1, 1, 0);
    expect(i1).toBe(0);
    expect(i2).toBe(1);
    expect(poolCounts.particleCount).toBe(2);
  });

  it('プール満杯時に NO_PARTICLE を返す', () => {
    fillParticlePool();
    const idx = spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, 0);
    expect(idx).toBe(NO_PARTICLE);
  });
});

describe('spawnProjectile', () => {
  it('プロジェクタイルを生成する', () => {
    const idx = spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(idx).toBe(0);
    expect(poolCounts.projectileCount).toBe(1);
    const p = getProjectile(0);
    expect(p.alive).toBe(true);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(p.damage).toBe(10);
    expect(p.team).toBe(0);
    expect(p.homing).toBe(false);
    expect(p.aoe).toBe(0);
    expect(p.targetIndex).toBe(-1);
  });

  it('オプション引数が反映される', () => {
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 1, 2, 1, 1, 1, true, 70, 42 as UnitIndex);
    expect(idx).toBe(0);
    const p = getProjectile(0);
    expect(p.homing).toBe(true);
    expect(p.aoe).toBe(70);
    expect(p.targetIndex).toBe(42);
  });

  it('プール満杯時に NO_PROJECTILE を返す', () => {
    fillProjectilePool();
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 0, 2, 1, 0, 0);
    expect(idx).toBe(NO_PROJECTILE);
  });
});

describe('spawnUnit', () => {
  it('Fighterユニットを生成する (type=1)', () => {
    const idx = spawnUnit(0, 1, 100, 200);
    expect(idx).toBe(0);
    expect(poolCounts.unitCount).toBe(1);
    const u = getUnit(0);
    const fighter = getUnitType(1);
    expect(u.alive).toBe(true);
    expect(u.team).toBe(0);
    expect(u.type).toBe(1);
    expect(u.x).toBe(100);
    expect(u.y).toBe(200);
    expect(u.hp).toBe(fighter.hp);
    expect(u.maxHp).toBe(fighter.hp);
    expect(u.mass).toBe(fighter.mass);
    expect(u.vx).toBe(0);
    expect(u.vy).toBe(0);
    expect(u.kills).toBe(0);
    expect(u.vet).toBe(0);
  });

  it('プール満杯時に -1 を返す', () => {
    fillUnitPool();
    const overflow = spawnUnit(0, 0, 0, 0);
    expect(overflow).toBe(-1);
    expect(poolCounts.unitCount).toBe(POOL_UNITS);
  });

  it('dead スロットを再利用する', () => {
    spawnUnit(0, 0, 0, 0);
    spawnUnit(0, 0, 0, 0);
    killUnit(0 as UnitIndex);
    const reused = spawnUnit(1, 1, 50, 50);
    expect(reused).toBe(0);
    expect(getUnit(0).team).toBe(1);
    expect(getUnit(0).x).toBe(50);
  });
});

describe('killUnit', () => {
  it('ユニットを無効化し poolCounts.unitCount を減少させる', () => {
    spawnUnit(0, 0, 0, 0);
    expect(poolCounts.unitCount).toBe(1);
    killUnit(0 as UnitIndex);
    expect(getUnit(0).alive).toBe(false);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnUnit(0, 0, 0, 0);
    killUnit(0 as UnitIndex);
    killUnit(0 as UnitIndex);
    expect(poolCounts.unitCount).toBe(0);
  });
});

describe('killParticle', () => {
  it('パーティクルを無効化し poolCounts.particleCount を減少させる', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, 0);
    expect(poolCounts.particleCount).toBe(1);
    killParticle(0 as ParticleIndex);
    expect(getParticle(0).alive).toBe(false);
    expect(poolCounts.particleCount).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, 0);
    killParticle(0 as ParticleIndex);
    killParticle(0 as ParticleIndex);
    expect(poolCounts.particleCount).toBe(0);
  });
});

describe('killProjectile', () => {
  it('プロジェクタイルを無効化し poolCounts.projectileCount を減少させる', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(poolCounts.projectileCount).toBe(1);
    killProjectile(0 as ProjectileIndex);
    expect(getProjectile(0).alive).toBe(false);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    killProjectile(0 as ProjectileIndex);
    killProjectile(0 as ProjectileIndex);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

describe('addBeam', () => {
  it('beams配列にビームを追加する', () => {
    addBeam(0, 0, 100, 100, 1, 0, 0, 0.5, 2);
    expect(beams).toHaveLength(1);
    expect(beams[0]).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      r: 1,
      g: 0,
      b: 0,
      life: 0.5,
      maxLife: 0.5,
      width: 2,
    });
  });

  it('複数ビームが蓄積される', () => {
    addBeam(0, 0, 10, 10, 1, 1, 1, 1, 1);
    addBeam(20, 20, 30, 30, 0, 1, 0, 0.5, 3);
    expect(beams).toHaveLength(2);
  });
});
