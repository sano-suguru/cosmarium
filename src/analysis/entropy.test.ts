import { describe, expect, it } from 'vitest';
import { asType } from '../__test__/pool-helper.ts';
import type { FleetComposition } from '../types.ts';
import type { BattleStateSnapshot } from './entropy.ts';
import {
  battleComplexity,
  fleetCostEntropy,
  fleetDiversity,
  lzComplexity,
  ngramEntropy,
  ngramFrequencies,
  normalizedEntropy,
  rleCompressionRatio,
  shannonEntropy,
  spatialEntropy,
} from './entropy.ts';

// ─── Shannon Entropy ───────────────────────────────────────────────

describe('shannonEntropy', () => {
  it('returns 0 for empty input', () => {
    expect(shannonEntropy([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(shannonEntropy([5])).toBe(0);
  });

  it('returns 1 bit for two equal elements', () => {
    expect(shannonEntropy([1, 1])).toBeCloseTo(1, 5);
  });

  it('returns log2(4) = 2 for four equal elements', () => {
    expect(shannonEntropy([1, 1, 1, 1])).toBeCloseTo(2, 5);
  });

  it('returns less entropy for skewed distribution', () => {
    const uniform = shannonEntropy([1, 1, 1, 1]);
    const skewed = shannonEntropy([10, 1, 1, 1]);
    expect(skewed).toBeLessThan(uniform);
  });

  it('ignores zero counts', () => {
    expect(shannonEntropy([0, 0, 5])).toBe(0);
  });

  it('ignores negative counts', () => {
    expect(shannonEntropy([-1, 5, 5])).toBe(shannonEntropy([5, 5]));
  });
});

describe('normalizedEntropy', () => {
  it('returns 0 for single non-zero element', () => {
    expect(normalizedEntropy([0, 0, 5])).toBe(0);
  });

  it('returns 1 for perfectly uniform distribution', () => {
    expect(normalizedEntropy([1, 1, 1, 1])).toBeCloseTo(1, 5);
  });

  it('returns value between 0 and 1 for skewed distribution', () => {
    const e = normalizedEntropy([10, 1, 1, 1]);
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(1);
  });
});

// ─── Fleet Diversity ───────────────────────────────────────────────

describe('fleetDiversity', () => {
  it('returns 0 for single-type fleet', () => {
    const fleet: FleetComposition = [{ type: asType(0), count: 50 }];
    expect(fleetDiversity(fleet)).toBe(0);
  });

  it('returns high diversity for multi-type fleet', () => {
    const fleet: FleetComposition = [
      { type: asType(0), count: 10 },
      { type: asType(1), count: 10 },
      { type: asType(2), count: 10 },
      { type: asType(3), count: 10 },
    ];
    expect(fleetDiversity(fleet)).toBeCloseTo(1, 5);
  });

  it('returns higher diversity when types are more balanced', () => {
    const balanced: FleetComposition = [
      { type: asType(0), count: 5 },
      { type: asType(1), count: 5 },
    ];
    const unbalanced: FleetComposition = [
      { type: asType(0), count: 9 },
      { type: asType(1), count: 1 },
    ];
    expect(fleetDiversity(balanced)).toBeGreaterThan(fleetDiversity(unbalanced));
  });

  it('returns 0 for empty fleet', () => {
    expect(fleetDiversity([])).toBe(0);
  });
});

describe('fleetCostEntropy', () => {
  it('weights by cost — expensive units contribute more', () => {
    // Drone(cost=1) x10 vs Flagship(cost=20) x1
    // count分布: [10, 1] → 非常に偏り → 低いエントロピー
    // cost分布: [10, 20] → より均衡 → 高いエントロピー
    const fleet: FleetComposition = [
      { type: asType(0), count: 10 },
      { type: asType(4), count: 1 },
    ];
    const countDiv = fleetDiversity(fleet);
    const costDiv = fleetCostEntropy(fleet);
    // コスト加重ではDrone/Flagshipの予算比が均衡に近づくため、count基準より高い
    expect(costDiv).toBeGreaterThan(countDiv);
  });
});

// ─── N-gram ────────────────────────────────────────────────────────

describe('ngramFrequencies', () => {
  it('returns empty map for n > sequence length', () => {
    expect(ngramFrequencies([1, 2], 3).size).toBe(0);
  });

  it('counts bigrams correctly', () => {
    const freq = ngramFrequencies([1, 2, 1, 2, 1], 2);
    expect(freq.get('1,2')).toBe(2);
    expect(freq.get('2,1')).toBe(2);
  });

  it('counts unigrams correctly', () => {
    const freq = ngramFrequencies([0, 0, 1, 0], 1);
    expect(freq.get('0')).toBe(3);
    expect(freq.get('1')).toBe(1);
  });
});

describe('ngramEntropy', () => {
  it('returns 0 for constant sequence', () => {
    expect(ngramEntropy([1, 1, 1, 1], 2)).toBe(0);
  });

  it('returns higher entropy for varied sequence', () => {
    const constant = ngramEntropy([1, 1, 1, 1, 1, 1], 2);
    const varied = ngramEntropy([1, 2, 3, 1, 2, 3], 2);
    expect(varied).toBeGreaterThan(constant);
  });
});

// ─── Compression / LZ Complexity ───────────────────────────────────

describe('lzComplexity', () => {
  it('returns 0 for empty sequence', () => {
    expect(lzComplexity([])).toBe(0);
  });

  it('returns low complexity for repetitive sequence', () => {
    // 十分な長さで繰り返しパターンを検出させる
    const repetitive = lzComplexity([1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
    const random = lzComplexity([3, 7, 1, 9, 4, 6, 2, 8, 5, 0, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
    expect(repetitive).toBeLessThan(random);
  });

  it('returns value between 0 and 1', () => {
    const c = lzComplexity([1, 2, 3, 4, 5]);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});

describe('rleCompressionRatio', () => {
  it('returns 0 for empty data', () => {
    expect(rleCompressionRatio([])).toBe(0);
  });

  it('returns low ratio for constant data', () => {
    const ratio = rleCompressionRatio([5, 5, 5, 5, 5]);
    expect(ratio).toBeCloseTo(1 / 5, 5);
  });

  it('returns 1 for fully alternating data', () => {
    const ratio = rleCompressionRatio([1, 2, 1, 2, 1, 2]);
    expect(ratio).toBe(1);
  });
});

// ─── Spatial Entropy ───────────────────────────────────────────────

describe('spatialEntropy', () => {
  it('returns 0 for single unit', () => {
    expect(spatialEntropy([100, 100], 1000)).toBe(0);
  });

  it('returns 0 for units in same cell', () => {
    // gridDiv=8, cellSize=125 → (10,10) and (20,20) in same cell
    expect(spatialEntropy([10, 10, 20, 20], 1000, 8)).toBe(0);
  });

  it('returns high entropy for units spread across cells', () => {
    const topLeft = [100, 100];
    const topRight = [600, 100];
    const bottomLeft = [100, 600];
    const bottomRight = [600, 600];
    const positions = [...topLeft, ...topRight, ...bottomLeft, ...bottomRight];
    const e = spatialEntropy(positions, 1000, 8);
    expect(e).toBeGreaterThan(0.85);
  });

  it('clustered units have lower entropy than spread units', () => {
    const clustered = spatialEntropy([10, 10, 15, 15, 20, 20, 25, 25], 1000, 8);
    const spread = spatialEntropy([100, 100, 400, 400, 700, 100, 100, 700], 1000, 8);
    expect(clustered).toBeLessThan(spread);
  });
});

// ─── Battle Complexity ─────────────────────────────────────────────

describe('battleComplexity', () => {
  it('returns 0 for insufficient snapshots', () => {
    expect(battleComplexity([])).toBe(0);
    expect(
      battleComplexity([
        { teamCounts: Int32Array.from([10, 10]), teamKills: Int32Array.from([0, 0]), spatialEntropy: 0.5 },
      ]),
    ).toBe(0);
  });

  it('returns higher complexity for dynamic battle', () => {
    const boring: BattleStateSnapshot[] = Array.from({ length: 20 }, () => ({
      teamCounts: Int32Array.from([10, 10]),
      teamKills: Int32Array.from([0, 0]),
      spatialEntropy: 0.5,
    }));

    const dynamic: BattleStateSnapshot[] = Array.from({ length: 20 }, (_, i) => ({
      teamCounts: Int32Array.from([10 - Math.floor(i / 4), 10 - Math.floor(i / 3)]),
      teamKills: Int32Array.from([Math.floor(i / 3), Math.floor(i / 4)]),
      spatialEntropy: 0.3 + 0.4 * Math.sin(i * 0.5),
    }));

    expect(battleComplexity(dynamic)).toBeGreaterThan(battleComplexity(boring));
  });

  it('returns value between 0 and 1', () => {
    const snapshots: BattleStateSnapshot[] = Array.from({ length: 10 }, (_, i) => ({
      teamCounts: Int32Array.from([10 - i, 10]),
      teamKills: Int32Array.from([0, i]),
      spatialEntropy: 0.5 + i * 0.05,
    }));
    const c = battleComplexity(snapshots);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });
});
