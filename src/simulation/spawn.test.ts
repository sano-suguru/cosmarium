import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
import { beams } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { addBeam, killUnit, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

afterEach(() => {
  resetPools();
});

describe('spawnParticle', () => {
  it('パーティクルを生成し poolCounts.particleCount が増加する', () => {
    const idx = spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, 0);
    expect(idx).toBe(0);
    expect(poolCounts.particleCount).toBe(1);
    const p = particlePool[0]!;
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
});

describe('spawnProjectile', () => {
  it('プロジェクタイルを生成する', () => {
    const idx = spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(idx).toBe(0);
    expect(poolCounts.projectileCount).toBe(1);
    const p = projectilePool[0]!;
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
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 1, 2, 1, 1, 1, true, 70, 42);
    expect(idx).toBe(0);
    const p = projectilePool[0]!;
    expect(p.homing).toBe(true);
    expect(p.aoe).toBe(70);
    expect(p.targetIndex).toBe(42);
  });
});

describe('spawnUnit', () => {
  it('Fighterユニットを生成する (type=1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnUnit(0, 1, 100, 200);
    expect(idx).toBe(0);
    expect(poolCounts.unitCount).toBe(1);
    const u = unitPool[0]!;
    const fighter = TYPES[1]!;
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
    for (let i = 0; i < POOL_UNITS; i++) {
      unitPool[i]!.alive = true;
    }
    poolCounts.unitCount = POOL_UNITS;
    const overflow = spawnUnit(0, 0, 0, 0);
    expect(overflow).toBe(-1);
    expect(poolCounts.unitCount).toBe(POOL_UNITS);
  });

  it('dead スロットを再利用する', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    spawnUnit(0, 0, 0, 0);
    spawnUnit(0, 0, 0, 0);
    killUnit(0);
    const reused = spawnUnit(1, 1, 50, 50);
    expect(reused).toBe(0);
    expect(unitPool[0]!.team).toBe(1);
    expect(unitPool[0]!.x).toBe(50);
  });
});

describe('killUnit', () => {
  it('ユニットを無効化し poolCounts.unitCount を減少させる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    spawnUnit(0, 0, 0, 0);
    expect(poolCounts.unitCount).toBe(1);
    killUnit(0);
    expect(unitPool[0]!.alive).toBe(false);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    spawnUnit(0, 0, 0, 0);
    killUnit(0);
    killUnit(0);
    expect(poolCounts.unitCount).toBe(0);
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
