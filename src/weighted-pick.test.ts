import { describe, expect, it } from 'vitest';
import { makeRng } from './__test__/pool-helper.ts';
import { weightedPick } from './weighted-pick.ts';

describe('weightedPick', () => {
  it('単一候補は常に 0 を返す', () => {
    const rng = makeRng();
    for (let i = 0; i < 20; i++) {
      expect(weightedPick([{ weight: 5 }], rng)).toBe(0);
    }
  });

  it('weight 0 の候補はスキップされる', () => {
    const rng = makeRng();
    for (let i = 0; i < 50; i++) {
      expect(weightedPick([{ weight: 0 }, { weight: 10 }], rng)).toBe(1);
    }
  });

  it('totalW <= 0 の場合は throw する', () => {
    const rng = makeRng();
    expect(() => weightedPick([{ weight: 0 }, { weight: 0 }], rng)).toThrow();
    expect(() => weightedPick([], rng)).toThrow();
  });

  it('重み偏りに応じた確率分布', () => {
    const rng = makeRng(1);
    let count0 = 0;
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      const idx = weightedPick([{ weight: 3 }, { weight: 1 }], rng);
      if (idx === 0) {
        count0++;
      }
    }
    // weight 3:1 → idx 0 が約75% (60-90%の範囲で許容)
    const ratio = count0 / runs;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.9);
  });
});
