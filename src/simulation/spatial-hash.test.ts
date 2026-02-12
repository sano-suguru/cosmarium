import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools } from '../__test__/pool-helper.ts';
import { unitPool } from '../pools.ts';
import { _nb, bHash, gN, kb } from './spatial-hash.ts';
import { killUnit, spawnUnit } from './spawn.ts';

afterEach(() => {
  resetPools();
});

function spawnAt(team: 0 | 1, x: number, y: number): number {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0) // ang
    .mockReturnValueOnce(0) // cd
    .mockReturnValueOnce(0); // wn
  return spawnUnit(team, 1, x, y);
}

describe('bHash + gN', () => {
  it('空プールで近傍ゼロ', () => {
    bHash();
    const n = gN(0, 0, 200, _nb);
    expect(n).toBe(0);
  });

  it('1体のユニットを検出する', () => {
    spawnAt(0, 50, 50);
    bHash();
    const n = gN(50, 50, 200, _nb);
    expect(n).toBe(1);
    expect(_nb[0]).toBe(0);
  });

  it('同セル内の複数ユニットを検出する', () => {
    spawnAt(0, 10, 10);
    spawnAt(1, 20, 20);
    bHash();
    const n = gN(15, 15, 200, _nb);
    expect(n).toBe(2);
    const found = [_nb[0], _nb[1]].sort();
    expect(found).toEqual([0, 1]);
  });

  it('dead ユニットは除外される', () => {
    spawnAt(0, 50, 50);
    const i1 = spawnAt(1, 60, 60);
    killUnit(i1);
    bHash();
    const n = gN(55, 55, 200, _nb);
    expect(n).toBe(1);
    expect(_nb[0]).toBe(0);
  });

  it('範囲外のユニットは検出されない', () => {
    spawnAt(0, 0, 0);
    spawnAt(1, 3000, 3000);
    bHash();
    const n = gN(0, 0, 100, _nb);
    expect(n).toBe(1);
    expect(_nb[0]).toBe(0);
  });

  it('移動後に再構築で新位置を反映', () => {
    const idx = spawnAt(0, 50, 50);
    bHash();
    let n = gN(50, 50, 100, _nb);
    expect(n).toBe(1);

    unitPool[idx]!.x = 2000;
    unitPool[idx]!.y = 2000;
    bHash();
    n = gN(50, 50, 100, _nb);
    expect(n).toBe(0);
    n = gN(2000, 2000, 100, _nb);
    expect(n).toBe(1);
  });
});

describe('kb', () => {
  it('X軸方向にノックバックする', () => {
    const idx = spawnAt(0, 100, 0);
    unitPool[idx]!.vx = 0;
    unitPool[idx]!.vy = 0;
    kb(idx, 0, 0, 50);
    expect(unitPool[idx]!.vx).toBeGreaterThan(0);
    expect(unitPool[idx]!.vy).toBeCloseTo(0);
  });

  it('斜め方向にノックバックする', () => {
    const idx = spawnAt(0, 100, 100);
    unitPool[idx]!.vx = 0;
    unitPool[idx]!.vy = 0;
    kb(idx, 0, 0, 50);
    expect(unitPool[idx]!.vx).toBeGreaterThan(0);
    expect(unitPool[idx]!.vy).toBeGreaterThan(0);
    expect(unitPool[idx]!.vx).toBeCloseTo(unitPool[idx]!.vy);
  });

  it('既存速度に加算される', () => {
    const idx = spawnAt(0, 100, 0);
    unitPool[idx]!.vx = 10;
    unitPool[idx]!.vy = 5;
    kb(idx, 0, 0, 50);
    expect(unitPool[idx]!.vx).toBeGreaterThan(10);
    expect(unitPool[idx]!.vy).toBeCloseTo(5);
  });

  it('mass が大きいほどノックバックが小さい', () => {
    const i1 = spawnAt(0, 100, 0);
    unitPool[i1]!.vx = 0;
    unitPool[i1]!.mass = 1;
    kb(i1, 0, 0, 50);
    const lightKB = unitPool[i1]!.vx;

    const i2 = spawnAt(1, 100, 0);
    unitPool[i2]!.vx = 0;
    unitPool[i2]!.mass = 10;
    kb(i2, 0, 0, 50);
    const heavyKB = unitPool[i2]!.vx;

    expect(lightKB).toBeGreaterThan(heavyKB);
  });
});
