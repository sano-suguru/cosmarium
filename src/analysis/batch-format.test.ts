import { describe, expect, it } from 'vitest';
import { formatSummary } from './batch-format.ts';
import type { BatchConfig, BatchSummary, TrialResult, UnitTypeSummary } from './batch-types.ts';

function makeMinimalConfig(): BatchConfig {
  return {
    trials: 0,
    mode: 'battle',
    teams: 2,
    seed: 1,
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

  // ─── 勝率フォーマット ─────────────────────────────────────────
  it('winRates のラベルとパーセンテージを正しく表示する', () => {
    const summary = makeMinimalSummary({
      stats: {
        avgSteps: 500,
        avgComplexity: 0.75,
        winRates: { '0': 0.6, '1': 0.3, draw: 0.1 },
        avgSpatialEntropy: 1.5,
        avgKillSequenceEntropy: 2.0,
      },
    });

    const output = formatSummary(summary);
    expect(output).toContain('チーム0: 60.0%');
    expect(output).toContain('チーム1: 30.0%');
    expect(output).toContain('引分: 10.0%');
  });

  it('winRates に timeout キーがあると「時間切」ラベルで表示する', () => {
    const summary = makeMinimalSummary({
      stats: {
        avgSteps: 1000,
        avgComplexity: 0,
        winRates: { timeout: 1.0 },
        avgSpatialEntropy: 0,
        avgKillSequenceEntropy: 0,
      },
    });

    const output = formatSummary(summary);
    expect(output).toContain('時間切: 100.0%');
  });

  // ─── ユニットサマリー詳細 ─────────────────────────────────────
  it('unitSummary にユニット名・キル・デス列が含まれる', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          name: 'Fighter',
          totalSpawned: 50,
          totalKills: 30,
          totalDeaths: 20,
          kd: 1.5,
          survivalRate: 0.6,
        }),
        makeUnitSummary({
          name: 'Healer',
          totalSpawned: 20,
          totalKills: 2,
          totalDeaths: 10,
          kd: 0.2,
          survivalRate: 0.5,
        }),
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('Fighter');
    expect(output).toContain('Healer');
    expect(output).toContain('ユニットタイプ別戦績');
    expect(output).toContain('キル');
    expect(output).toContain('デス');
  });

  it('winDelta > 0.1 で OP候補、< -0.1 で UP候補が表示される', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          name: 'StrongUnit',
          totalSpawned: 10,
          winDelta: 0.25,
          winRateWhenPresent: 0.8,
          kd: 3.0,
        }),
        makeUnitSummary({
          name: 'WeakUnit',
          totalSpawned: 10,
          winDelta: -0.15,
          winRateWhenPresent: 0.3,
          kd: 0.5,
        }),
        makeUnitSummary({
          name: 'NormalUnit',
          totalSpawned: 10,
          winDelta: 0.05,
          winRateWhenPresent: 0.5,
          kd: 1.0,
        }),
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('[OP] OP候補: StrongUnit');
    expect(output).toContain('[UP] UP候補: WeakUnit');
    // NormalUnit はバランス候補行に表示されない
    expect(output).not.toMatch(/候補: NormalUnit/);
  });

  // ─── キルマトリクス ───────────────────────────────────────────
  it('killMatrix データがあるときキルマトリクスセクションを出力する', () => {
    const matrixData = [new Int32Array([0, 15]), new Int32Array([8, 0])];
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          typeIndex: 0,
          name: 'Attacker',
          totalSpawned: 20,
          totalKills: 15,
          topVictimType: 1,
          topThreatType: 1,
        }),
        makeUnitSummary({
          typeIndex: 1,
          name: 'Defender',
          totalSpawned: 20,
          totalKills: 8,
          topVictimType: 0,
          topThreatType: 0,
        }),
      ],
      killMatrix: { data: matrixData, size: 2 },
    });

    const output = formatSummary(summary);
    expect(output).toContain('キルマトリクス (上位20組)');
    expect(output).toContain('Attacker');
    expect(output).toContain('Defender');
    expect(output).toContain('得意=');
    expect(output).toContain('苦手=');
  });

  // ─── エッジケース: ゼロ試行 ───────────────────────────────────
  it('試合数ゼロでもクラッシュせず基本情報を出力する', () => {
    const summary = makeMinimalSummary({
      config: { ...makeMinimalConfig(), trials: 0 },
      trials: [],
    });

    const output = formatSummary(summary);
    expect(output).toContain('試合数: 0');
    expect(output).toContain('COSMARIUM バッチ対戦分析');
    // 個別試合行なし
    expect(output).not.toContain('#000');
  });

  // ─── エッジケース: 全引き分け ─────────────────────────────────
  it('全試合引き分けのとき draw 100% が表示される', () => {
    const summary = makeMinimalSummary({
      config: { ...makeMinimalConfig(), trials: 5 },
      stats: {
        avgSteps: 200,
        avgComplexity: 0.3,
        winRates: { draw: 1.0 },
        avgSpatialEntropy: 0.5,
        avgKillSequenceEntropy: 0.1,
      },
      trials: Array.from({ length: 5 }, (_, i) => makeMinimalTrial({ trialIndex: i, winner: 'draw' })),
    });

    const output = formatSummary(summary);
    expect(output).toContain('引分: 100.0%');
    expect(output).not.toContain('チーム0:');
    expect(output).not.toContain('チーム1:');
  });

  // ─── エッジケース: 大きなステップ数 ───────────────────────────
  it('数千ステップの値を正しくフォーマットする', () => {
    const summary = makeMinimalSummary({
      config: { ...makeMinimalConfig(), trials: 1, maxSteps: 99999 },
      stats: {
        avgSteps: 85432.7,
        avgComplexity: 0.999,
        winRates: { '0': 1.0 },
        avgSpatialEntropy: 1.2345,
        avgKillSequenceEntropy: 0.6789,
      },
      trials: [makeMinimalTrial({ steps: 85433, winner: 0 })],
    });

    const output = formatSummary(summary);
    expect(output).toContain('85432.7');
    expect(output).toContain('最大ステップ: 99999');
    expect(output).toContain('85433');
  });

  // ─── ダメージテーブル ─────────────────────────────────────────
  it('ダメージ統計セクションが表示される', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          name: 'Cannon',
          totalSpawned: 10,
          totalDamageDealt: 5000,
          totalDamageReceived: 1000,
          damagePerCost: 50.0,
        }),
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('ダメージ統計');
    expect(output).toContain('Cannon');
  });

  // ─── サポートテーブル ─────────────────────────────────────────
  it('サポート効果統計セクションが表示される', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          name: 'Medic',
          totalSpawned: 5,
          totalHealing: 3000,
          supportScore: 150,
        }),
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('サポート効果統計');
    expect(output).toContain('Medic');
  });

  // ─── 生存時間テーブル ─────────────────────────────────────────
  it('生存時間分布セクションが表示される', () => {
    const summary = makeMinimalSummary({
      unitSummary: [makeUnitSummary({ name: 'Tank', totalSpawned: 10, avgLifespan: 45.67 })],
    });

    const output = formatSummary(summary);
    expect(output).toContain('生存時間分布');
    expect(output).toContain('Tank');
    expect(output).toContain('45.67');
  });

  // ─── 死因内訳テーブル ─────────────────────────────────────────
  it('死因内訳セクションが表示される', () => {
    const summary = makeMinimalSummary({
      unitSummary: [
        makeUnitSummary({
          name: 'Scout',
          totalSpawned: 10,
          deathsByContext: new Int32Array([5, 2, 1, 0, 0, 0]),
        }),
      ],
    });

    const output = formatSummary(summary);
    expect(output).toContain('死因内訳');
    expect(output).toContain('Scout');
  });
});

// ─── ヘルパー ───────────────────────────────────────────────────

function makeUnitSummary(overrides: Partial<UnitTypeSummary> & { name: string }): UnitTypeSummary {
  return {
    typeIndex: 0,
    totalSpawned: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalSurvived: 0,
    survivalRate: 0,
    kd: 0,
    cost: 10,
    killsPerCost: 0,
    winRateWhenPresent: 0,
    winRateWhenAbsent: 0,
    winDelta: 0,
    topVictimType: null,
    topThreatType: null,
    totalDamageDealt: 0,
    totalDamageReceived: 0,
    damagePerCost: 0,
    totalHealing: 0,
    supportScore: 0,
    avgLifespan: 0,
    deathsByContext: new Int32Array(0),
    ...overrides,
  };
}

function makeMinimalTrial(overrides?: Partial<TrialResult>): TrialResult {
  return {
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
    damageStats: {
      dealtByType: new Float64Array(0),
      receivedByType: new Float64Array(0),
    },
    supportStats: {
      healingByType: new Float64Array(0),
      ampApplications: new Float64Array(0),
      scrambleApplications: new Float64Array(0),
      catalystApplications: new Float64Array(0),
    },
    killSequenceEntropy: 0,
    killContextStats: { contextCounts: [] },
    lifespanStats: { totalLifespan: new Float64Array(0) },
    ...overrides,
  };
}
