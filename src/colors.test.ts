import { describe, expect, it } from 'vitest';
import { getColor, getTrailColor } from './colors.ts';

describe('getColor', () => {
  it('index 0, team 0 を返す', () => {
    expect(getColor(0, 0)).toEqual([0.2, 1, 0.55]);
  });

  it('index 0, team 1 を返す', () => {
    expect(getColor(0, 1)).toEqual([1, 0.45, 0.25]);
  });

  it('index 14 (最後), team 0 を返す', () => {
    expect(getColor(14, 0)).toEqual([1, 1, 0.3]);
  });

  it('index 14, team 1 を返す', () => {
    expect(getColor(14, 1)).toEqual([0.3, 1, 1]);
  });

  it('RGB値は全て 0〜1 の範囲', () => {
    for (let t = 0; t < 15; t++) {
      for (const tm of [0, 1] as const) {
        const c = getColor(t, tm);
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('getTrailColor', () => {
  it('index 0, team 0 のトレイルカラーを返す', () => {
    expect(getTrailColor(0, 0)).toEqual([0.1, 0.6, 0.35]);
  });

  it('index 0, team 1 のトレイルカラーを返す', () => {
    expect(getTrailColor(0, 1)).toEqual([0.6, 0.25, 0.12]);
  });

  it('トレイルカラーはメインカラーより暗い（合計値が小さい）', () => {
    for (let t = 0; t < 15; t++) {
      for (const tm of [0, 1] as const) {
        const main = getColor(t, tm);
        const trail = getTrailColor(t, tm);
        const mainSum = main[0] + main[1] + main[2];
        const trailSum = trail[0] + trail[1] + trail[2];
        expect(trailSum).toBeLessThanOrEqual(mainSum);
      }
    }
  });
});
