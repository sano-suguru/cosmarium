import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import type { UnitIndex } from '../types.ts';
import { computeDemoBounds } from './codex.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('computeDemoBounds', () => {
  it('N=0 (デモユニット全滅時) → フォールバック値', () => {
    const snapshot = new Set<UnitIndex>();
    const result = computeDemoBounds(snapshot);
    expect(result).toEqual({ cx: 0, cy: 0, radius: 100 });
  });

  it('N=1 (100, 200) → minRadius適用で radius=80', () => {
    const snapshot = new Set<UnitIndex>();
    const idx = spawnAt(0, 0, 100, 200);
    snapshot.add(idx);
    spawnAt(0, 1, 100, 200);

    const result = computeDemoBounds(snapshot);
    expect(result.cx).toBeCloseTo(100, 0);
    expect(result.cy).toBeCloseTo(200, 0);
    expect(result.radius).toBe(80);
  });

  it('N=3 → 重心が平均座標と一致、radius が最遠距離 + 50', () => {
    const snapshot = new Set<UnitIndex>();
    const idx1 = spawnAt(0, 0, 0, 0);
    snapshot.add(idx1);

    spawnAt(0, 1, 0, 100);
    spawnAt(0, 2, 100, 0);
    spawnAt(0, 3, -100, 0);

    const result = computeDemoBounds(snapshot);
    expect(result.cx).toBeCloseTo(0, 0);
    expect(result.cy).toBeCloseTo(33.33, 1);
    expect(result.radius).toBeGreaterThan(150);
    expect(result.radius).toBeLessThan(180);
  });

  it('全ユニット同一座標 → radius = 80 (minRadius)', () => {
    const snapshot = new Set<UnitIndex>();
    const idx = spawnAt(0, 0, 50, 50);
    snapshot.add(idx);

    spawnAt(0, 1, 50, 50);
    spawnAt(0, 2, 50, 50);
    spawnAt(0, 3, 50, 50);

    const result = computeDemoBounds(snapshot);
    expect(result.cx).toBeCloseTo(50, 0);
    expect(result.cy).toBeCloseTo(50, 0);
    expect(result.radius).toBe(80);
  });

  it('snapshot に含まれるユニットは計算から除外される', () => {
    const idx0 = spawnAt(0, 0, -500, -500);
    const idx1 = spawnAt(0, 1, 500, 500);

    spawnAt(0, 2, 0, 0);
    spawnAt(0, 3, 10, 10);

    const snapshot = new Set<UnitIndex>();
    snapshot.add(idx0);
    snapshot.add(idx1);

    const result = computeDemoBounds(snapshot);
    expect(result.cx).toBeCloseTo(5, 0);
    expect(result.cy).toBeCloseTo(5, 0);
    expect(result.radius).toBe(80);
  });
});
