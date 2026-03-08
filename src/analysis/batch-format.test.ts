import { describe, expect, it } from 'vitest';
import { formatSummary } from './batch-format.ts';
import type { BatchConfig, BatchSummary, TrialResult } from './batch-types.ts';

function makeMinimalConfig(): BatchConfig {
  return {
    trials: 0,
    mode: 'battle',
    teams: 2,
    seed: 1,
    budget: 100,
    maxSteps: 1000,
    snapshotInterval: 100,
    outFile: null,
    createRng: () => () => 0,
  };
}

function makeMinimalSummary(overrides?: Partial<BatchSummary>): BatchSummary {
  return {
    config: makeMinimalConfig(),
    trials: [],
    stats: {
      avgSteps: 0,
      avgComplexity: 0,
      winRates: {},
      avgSpatialEntropy: 0,
      avgKillSequenceEntropy: 0,
    },
    unitSummary: [],
    killMatrix: { data: [], size: 0 },
    synergyPairs: [],
    ...overrides,
  };
}

describe('formatSummary', () => {
  it('必須セクションヘッダーを含む', () => {
    const summary = makeMinimalSummary({
      config: { ...makeMinimalConfig(), trials: 1 },
      trials: [
        {
          trialIndex: 0,
          seed: 1,
          winner: 0,
          steps: 100,
          elapsed: 5,
          fleetDiversities: [0.5],
          fleetCompositions: [],
          snapshots: [],
          complexity: 0.5,
          unitStats: [],
          killMatrix: { data: [], size: 0 },
          damageStats: { dealtByType: new Float64Array(0), receivedByType: new Float64Array(0) },
          supportStats: {
            healingByType: new Float64Array(0),
            ampApplications: new Float64Array(0),
            scrambleApplications: new Float64Array(0),
            catalystApplications: new Float64Array(0),
          },
          killSequenceEntropy: 0,
          killContextStats: { contextCounts: [] },
          lifespanStats: { totalLifespan: new Float64Array(0) },
        } satisfies TrialResult,
      ],
    });

    const output = formatSummary(summary);

    expect(output).toContain('COSMARIUM バッチ対戦分析');
    expect(output).toContain('モード:');
    expect(output).toContain('平均ステップ数:');
    expect(output).toContain('平均複雑性スコア:');
    expect(output).toContain('平均空間エントロピー:');
    expect(output).toContain('勝率:');
  });

  it('unitSummary が存在するとき「ユニットタイプ別戦績」ヘッダーを含む', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        {
          typeIndex: 0,
          name: 'TestUnit',
          totalSpawned: 10,
          totalKills: 5,
          totalDeaths: 3,
          totalSurvived: 7,
          survivalRate: 0.7,
          kd: 1.67,
          cost: 10,
          killsPerCost: 0.5,
          winRateWhenPresent: 0.6,
          winRateWhenAbsent: 0.4,
          winDelta: 0.2,
          topVictimType: null,
          topThreatType: null,
          totalDamageDealt: 0,
          totalDamageReceived: 0,
          damagePerCost: 0,
          totalHealing: 0,
          supportScore: 0,
          avgLifespan: 0,
          deathsByContext: new Int32Array(0),
        },
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('ユニットタイプ別戦績');
  });

  it('空の unitSummary と trials でもクラッシュしない', () => {
    const summary = makeMinimalSummary();
    const output = formatSummary(summary);
    expect(typeof output).toBe('string');
    expect(output).toContain('COSMARIUM バッチ対戦分析');
  });

  it('synergyPairs が存在するとき「混成艦隊シナジー分析」ヘッダーを含む', () => {
    const summary = makeMinimalSummary({
      synergyPairs: [
        {
          typeA: 0,
          typeB: 1,
          nameA: 'UnitA',
          nameB: 'UnitB',
          coWinRate: 0.8,
          soloAWinRate: 0.5,
          soloBWinRate: 0.4,
          synergy: 0.3,
          coCount: 10,
        },
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('混成艦隊シナジー分析');
  });
});
