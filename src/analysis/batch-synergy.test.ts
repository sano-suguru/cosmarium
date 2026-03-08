import { describe, expect, it } from 'vitest';
import type { UnitTypeIndex } from '../types.ts';
import { aggregatePresenceWins, computeSynergyPairs, isBattleWithWinner } from './batch-synergy.ts';
import type { TrialResult } from './batch-types.ts';

/** テストに必要な最小限のフィールドだけ埋めた TrialResult を生成 */
function makeTrial(winner: number | 'draw' | null, fleetCompositions: TrialResult['fleetCompositions']): TrialResult {
  return {
    trialIndex: 0,
    seed: 0,
    winner,
    steps: 0,
    elapsed: 0,
    fleetDiversities: [],
    fleetCompositions,
    snapshots: [],
    complexity: 0,
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
  };
}

describe('isBattleWithWinner', () => {
  it('winner が number のとき true を返す', () => {
    const trial = makeTrial(0, [[], []]);
    expect(isBattleWithWinner(trial)).toBe(true);
  });

  it('winner が "draw" のとき false を返す', () => {
    const trial = makeTrial('draw', [[], []]);
    expect(isBattleWithWinner(trial)).toBe(false);
  });

  it('winner が null のとき false を返す', () => {
    const trial = makeTrial(null, [[], []]);
    expect(isBattleWithWinner(trial)).toBe(false);
  });

  it('fleetCompositions が1つだけのとき false を返す (2チーム制でない)', () => {
    const trial = makeTrial(0, [[]]);
    expect(isBattleWithWinner(trial)).toBe(false);
  });
});

describe('aggregatePresenceWins', () => {
  it('各ユニットタイプの勝敗カウントを集計する', () => {
    const typeA = 0 as UnitTypeIndex;
    const typeB = 1 as UnitTypeIndex;

    const trials: TrialResult[] = [
      // チーム0勝利: チーム0にA,B、チーム1にB
      makeTrial(0, [
        [
          { type: typeA, count: 3 },
          { type: typeB, count: 2 },
        ],
        [{ type: typeB, count: 5 }],
      ]),
      // チーム1勝利: チーム0にA、チーム1にA,B
      makeTrial(1, [
        [{ type: typeA, count: 2 }],
        [
          { type: typeA, count: 1 },
          { type: typeB, count: 4 },
        ],
      ]),
    ];

    const result = aggregatePresenceWins(trials);

    // typeA: trial0 チーム0(勝) + trial1 チーム0(負) + trial1 チーム1(勝) = wins:2, total:3
    const pwA = result.get(typeA);
    expect(pwA).toBeDefined();
    expect(pwA?.wins).toBe(2);
    expect(pwA?.total).toBe(3);

    // typeB: trial0 チーム0(勝) + trial0 チーム1(負) + trial1 チーム1(勝) = wins:2, total:3
    const pwB = result.get(typeB);
    expect(pwB).toBeDefined();
    expect(pwB?.wins).toBe(2);
    expect(pwB?.total).toBe(3);
  });

  it('draw や null の trial は無視する', () => {
    const typeA = 0 as UnitTypeIndex;

    const trials: TrialResult[] = [
      makeTrial('draw', [[{ type: typeA, count: 3 }], [{ type: typeA, count: 2 }]]),
      makeTrial(null, [[{ type: typeA, count: 1 }], [{ type: typeA, count: 1 }]]),
    ];

    const result = aggregatePresenceWins(trials);
    expect(result.size).toBe(0);
  });

  it('count が 0 のエントリは無視する', () => {
    const typeA = 0 as UnitTypeIndex;

    const trials: TrialResult[] = [makeTrial(0, [[{ type: typeA, count: 0 }], [{ type: typeA, count: 1 }]])];

    const result = aggregatePresenceWins(trials);
    // チーム0の typeA は count=0 なので記録されない、チーム1の typeA のみ (負け)
    const pw = result.get(typeA);
    expect(pw).toBeDefined();
    expect(pw?.wins).toBe(0);
    expect(pw?.total).toBe(1);
  });
});

describe('computeSynergyPairs', () => {
  it('共起回数が MIN_CO_COUNT(5) 未満のペアを除外する', () => {
    const typeA = 0 as UnitTypeIndex;
    const typeB = 1 as UnitTypeIndex;

    // 4回しか共起しない → フィルタされるはず
    const trials: TrialResult[] = Array.from({ length: 4 }, () =>
      makeTrial(0, [
        [
          { type: typeA, count: 1 },
          { type: typeB, count: 1 },
        ],
        [{ type: typeA, count: 1 }],
      ]),
    );

    const result = computeSynergyPairs(trials);
    // A+B ペアは共起4回 (チーム0のみで共起) → MIN_CO_COUNT=5 未満で除外
    const pair = result.find(
      (p) => (p.typeA === typeA && p.typeB === typeB) || (p.typeA === typeB && p.typeB === typeA),
    );
    expect(pair).toBeUndefined();
  });

  it('共起回数が MIN_CO_COUNT(5) 以上のペアは含まれる', () => {
    const typeA = 0 as UnitTypeIndex;
    const typeB = 1 as UnitTypeIndex;

    // 5回共起
    const trials: TrialResult[] = Array.from({ length: 5 }, () =>
      makeTrial(0, [
        [
          { type: typeA, count: 1 },
          { type: typeB, count: 1 },
        ],
        [{ type: typeA, count: 1 }],
      ]),
    );

    const result = computeSynergyPairs(trials);
    const pair = result.find(
      (p) => (p.typeA === typeA && p.typeB === typeB) || (p.typeA === typeB && p.typeB === typeA),
    );
    expect(pair).toBeDefined();
    expect(pair?.coCount).toBe(5);
  });

  it('synergy 降順でソートされる', () => {
    const typeA = 0 as UnitTypeIndex;
    const typeB = 1 as UnitTypeIndex;
    const typeC = 2 as UnitTypeIndex;

    // A+B: 全勝 (高シナジー), A+C: 全敗 (低シナジー)
    const trials: TrialResult[] = [];
    for (let i = 0; i < 6; i++) {
      // A+B はチーム0で全勝
      trials.push(
        makeTrial(0, [
          [
            { type: typeA, count: 1 },
            { type: typeB, count: 1 },
          ],
          [{ type: typeC, count: 1 }],
        ]),
      );
      // A+C はチーム0で全敗
      trials.push(
        makeTrial(1, [
          [
            { type: typeA, count: 1 },
            { type: typeC, count: 1 },
          ],
          [{ type: typeB, count: 1 }],
        ]),
      );
    }

    const result = computeSynergyPairs(trials);
    expect(result.length).toBeGreaterThanOrEqual(2);

    // 最初のペアのシナジーが2番目以降より大きい
    for (let i = 1; i < result.length; i++) {
      expect(result[0]?.synergy).toBeGreaterThanOrEqual(result[i]?.synergy ?? 0);
    }
  });
});
