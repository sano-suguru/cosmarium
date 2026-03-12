import { afterEach, describe, expect, it } from 'vitest';
import { asType, kill, resetPools, spawnAt } from '../__test__/pool-helper.ts';
import { unit } from '../pools-query.ts';
import { buildHash, getNeighbors, knockback } from './spatial-hash.ts';

afterEach(() => {
  resetPools();
});

describe('buildHash + getNeighbors', () => {
  it('空プールで近傍ゼロ', () => {
    buildHash();
    const nb = getNeighbors(0, 0, 200);
    expect(nb.count).toBe(0);
  });

  it('1体のユニットを検出する', () => {
    spawnAt(0, asType(1), 50, 50);
    buildHash();
    const nb = getNeighbors(50, 50, 200);
    expect(nb.count).toBe(1);
    expect(nb.at(0)).toBe(0);
  });

  it('同セル内の複数ユニットを検出する', () => {
    spawnAt(0, asType(1), 10, 10);
    spawnAt(1, asType(1), 20, 20);
    buildHash();
    const nb = getNeighbors(15, 15, 200);
    expect(nb.count).toBe(2);
    const found = [nb.at(0), nb.at(1)].sort();
    expect(found).toEqual([0, 1]);
  });

  it('dead ユニットは除外される', () => {
    spawnAt(0, asType(1), 50, 50);
    const i1 = spawnAt(1, asType(1), 60, 60);
    kill(i1);
    buildHash();
    const nb = getNeighbors(55, 55, 200);
    expect(nb.count).toBe(1);
    expect(nb.at(0)).toBe(0);
  });

  it('範囲外のユニットは検出されない', () => {
    spawnAt(0, asType(1), 0, 0);
    spawnAt(1, asType(1), 3000, 3000);
    buildHash();
    const nb = getNeighbors(0, 0, 100);
    expect(nb.count).toBe(1);
    expect(nb.at(0)).toBe(0);
  });

  it('移動後に再構築で新位置を反映', () => {
    const idx = spawnAt(0, asType(1), 50, 50);
    buildHash();
    let nb = getNeighbors(50, 50, 100);
    expect(nb.count).toBe(1);

    unit(idx).x = 2000;
    unit(idx).y = 2000;
    buildHash();
    nb = getNeighbors(50, 50, 100);
    expect(nb.count).toBe(0);
    nb = getNeighbors(2000, 2000, 100);
    expect(nb.count).toBe(1);
  });
});

describe('NeighborSlice.at — エラーパス', () => {
  it('範囲外インデックスでRangeError', () => {
    buildHash();
    const nb = getNeighbors(0, 0, 200);
    expect(() => nb.at(999999)).toThrow(RangeError);
  });
});

describe('knockback', () => {
  it('X軸方向にノックバックする', () => {
    const idx = spawnAt(0, asType(1), 100, 0);
    unit(idx).kbVx = 0;
    unit(idx).kbVy = 0;
    knockback(idx, 0, 0, 50);
    expect(unit(idx).kbVx).toBeGreaterThan(0);
    expect(unit(idx).kbVy).toBeCloseTo(0);
  });

  it('斜め方向にノックバックする', () => {
    const idx = spawnAt(0, asType(1), 100, 100);
    unit(idx).kbVx = 0;
    unit(idx).kbVy = 0;
    knockback(idx, 0, 0, 50);
    expect(unit(idx).kbVx).toBeGreaterThan(0);
    expect(unit(idx).kbVy).toBeGreaterThan(0);
    expect(unit(idx).kbVx).toBeCloseTo(unit(idx).kbVy);
  });

  it('既存速度に加算される', () => {
    const idx = spawnAt(0, asType(1), 100, 0);
    unit(idx).kbVx = 10;
    unit(idx).kbVy = 5;
    knockback(idx, 0, 0, 50);
    expect(unit(idx).kbVx).toBeGreaterThan(10);
    expect(unit(idx).kbVy).toBeCloseTo(5);
  });

  it('mass が大きいほどノックバックが小さい', () => {
    const i1 = spawnAt(0, asType(1), 100, 0);
    unit(i1).kbVx = 0;
    unit(i1).mass = 1;
    knockback(i1, 0, 0, 50);
    const lightKB = unit(i1).kbVx;

    const i2 = spawnAt(1, asType(1), 100, 0);
    unit(i2).kbVx = 0;
    unit(i2).mass = 10;
    knockback(i2, 0, 0, 50);
    const heavyKB = unit(i2).kbVx;

    expect(lightKB).toBeGreaterThan(heavyKB);
  });
});
