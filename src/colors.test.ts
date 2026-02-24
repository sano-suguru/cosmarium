import { describe, expect, it } from 'vitest';
import { color, effectColor, trailColor } from './colors.ts';

describe('getColor', () => {
  it('RGB値は全て 0〜1 の範囲', () => {
    for (let t = 0; t < 16; t++) {
      for (const tm of [0, 1] as const) {
        const c = color(t, tm);
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('同じユニットタイプでもチーム間で色が異なる', () => {
    for (let t = 0; t < 16; t++) {
      const c0 = color(t, 0);
      const c1 = color(t, 1);
      const diff = Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]);
      expect(diff).toBeGreaterThan(0.1);
    }
  });

  it('異なるユニットタイプ間で色に差がある', () => {
    const colors = Array.from({ length: 16 }, (_, t) => color(t, 0));
    let anyDifferent = false;
    for (let i = 0; i < colors.length - 1; i++) {
      const a = colors[i];
      const b = colors[i + 1];
      if (a === undefined || b === undefined) continue;
      const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      if (diff > 0.01) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });
});

describe('getTrailColor', () => {
  it('トレイルカラーはエフェクトカラーより暗い（合計値が小さい）', () => {
    for (let t = 0; t < 16; t++) {
      for (const tm of [0, 1] as const) {
        const main = effectColor(t, tm);
        const trail = trailColor(t, tm);
        const mainSum = main[0] + main[1] + main[2];
        const trailSum = trail[0] + trail[1] + trail[2];
        expect(trailSum).toBeLessThanOrEqual(mainSum);
      }
    }
  });

  it('RGB値は全て 0〜1 の範囲', () => {
    for (let t = 0; t < 16; t++) {
      for (const tm of [0, 1] as const) {
        const c = trailColor(t, tm);
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('getColor — エラーパス', () => {
  it('範囲外インデックスでRangeError', () => {
    expect(() => color(-1, 0)).toThrow(RangeError);
    expect(() => color(16, 0)).toThrow(RangeError);
  });
});

describe('getEffectColor', () => {
  it('RGB値は全て 0〜1 の範囲', () => {
    for (let t = 0; t < 16; t++) {
      for (const tm of [0, 1] as const) {
        const c = effectColor(t, tm);
        expect(c).toHaveLength(3);
        for (const v of c) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('同じユニットタイプでもチーム間で色が異なる', () => {
    for (let t = 0; t < 16; t++) {
      const c0 = effectColor(t, 0);
      const c1 = effectColor(t, 1);
      const diff = Math.abs(c0[0] - c1[0]) + Math.abs(c0[1] - c1[1]) + Math.abs(c0[2] - c1[2]);
      expect(diff).toBeGreaterThan(0.1);
    }
  });
});

describe('getTrailColor — エラーパス', () => {
  it('範囲外インデックスでRangeError', () => {
    expect(() => trailColor(-1, 0)).toThrow(RangeError);
    expect(() => trailColor(16, 0)).toThrow(RangeError);
  });
});

describe('getEffectColor — エラーパス', () => {
  it('範囲外インデックスでRangeError', () => {
    expect(() => effectColor(-1, 0)).toThrow(RangeError);
    expect(() => effectColor(16, 0)).toThrow(RangeError);
  });
});
