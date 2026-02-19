import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { computeDemoBounds } from './codex.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('computeDemoBounds', () => {
  it('N=0 (ユニット全滅時) → フォールバック値', () => {
    const result = computeDemoBounds();
    expect(result).toEqual({ cx: 0, cy: 0, radius: 100 });
  });

  it('N=1 (100, 200) → minRadius適用で radius=80', () => {
    spawnAt(0, 0, 100, 200);

    const result = computeDemoBounds();
    expect(result.cx).toBeCloseTo(100, 0);
    expect(result.cy).toBeCloseTo(200, 0);
    expect(result.radius).toBe(80);
  });

  it('N=3 → 重心が平均座標と一致、radius が最遠距離 + 50', () => {
    spawnAt(0, 1, 0, 100);
    spawnAt(0, 2, 100, 0);
    spawnAt(0, 3, -100, 0);

    const result = computeDemoBounds();
    expect(result.cx).toBeCloseTo(0, 0);
    expect(result.cy).toBeCloseTo(33.33, 1);
    expect(result.radius).toBeGreaterThan(150);
    expect(result.radius).toBeLessThan(180);
  });

  it('全ユニット同一座標 → radius = 80 (minRadius)', () => {
    for (let j = 0; j < 4; j++) {
      spawnAt(0, j, 50, 50);
    }

    const result = computeDemoBounds();
    expect(result.cx).toBeCloseTo(50, 0);
    expect(result.cy).toBeCloseTo(50, 0);
    expect(result.radius).toBe(80);
  });

  it('2ユニットが離れている場合 radius はminRadius以上', () => {
    spawnAt(0, 0, 0, 0);
    spawnAt(0, 1, 200, 0);

    const result = computeDemoBounds();
    expect(result.cx).toBeCloseTo(100, 0);
    expect(result.cy).toBeCloseTo(0, 0);
    expect(result.radius).toBeGreaterThanOrEqual(80);
  });
});
