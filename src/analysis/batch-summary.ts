/**
 * バッチ対戦システム — サマリー統計計算
 */

import { KILL_CONTEXT_COUNT } from '../simulation/on-kill-effects.ts';
import { TYPES } from '../unit-types.ts';
import { aggregatePresenceWins, computeSynergyPairs, isBattleWithWinner } from './batch-synergy.ts';
import { aggregateKillContext, aggregateLifespan } from './batch-tracking.ts';
import type {
  BatchConfig,
  BatchSummary,
  KillMatrix,
  SupportTracker,
  TrialResult,
  UnitTypeSummary,
} from './batch-types.ts';
import { typeName } from './batch-types.ts';

// ─── Aggregation Helpers ─────────────────────────────────────────

function aggregateKD(
  trials: readonly TrialResult[],
): Map<number, { spawned: number; kills: number; deaths: number; survived: number }> {
  const totals = new Map<number, { spawned: number; kills: number; deaths: number; survived: number }>();
  for (const trial of trials) {
    for (const us of trial.unitStats) {
      let t = totals.get(us.typeIndex);
      if (!t) {
        t = { spawned: 0, kills: 0, deaths: 0, survived: 0 };
        totals.set(us.typeIndex, t);
      }
      t.spawned += us.spawned;
      t.kills += us.kills;
      t.deaths += us.deaths;
      t.survived += us.survived;
    }
  }
  return totals;
}

function computeKD(kills: number, deaths: number): number {
  if (deaths > 0) {
    return kills / deaths;
  }
  return kills > 0 ? Number.POSITIVE_INFINITY : 0;
}

function aggregateKillMatrix(trials: readonly TrialResult[]): KillMatrix {
  const size = TYPES.length;
  const data: Int32Array[] = [];
  for (let i = 0; i < size; i++) {
    data.push(new Int32Array(size));
  }
  for (const trial of trials) {
    for (let k = 0; k < size; k++) {
      const row = trial.killMatrix.data[k];
      const agg = data[k];
      if (!row || !agg) {
        continue;
      }
      for (let v = 0; v < size; v++) {
        agg[v] = (agg[v] ?? 0) + (row[v] ?? 0);
      }
    }
  }
  return { data, size };
}

function accumulateTypedArray(map: Map<number, number>, arr: Float64Array) {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] ?? 0;
    if (v > 0) {
      map.set(i, (map.get(i) ?? 0) + v);
    }
  }
}

function accumulateSupportScore(map: Map<number, number>, sup: SupportTracker) {
  for (let i = 0; i < TYPES.length; i++) {
    const total =
      (sup.ampApplications[i] ?? 0) + (sup.scrambleApplications[i] ?? 0) + (sup.catalystApplications[i] ?? 0);
    if (total > 0) {
      map.set(i, (map.get(i) ?? 0) + total);
    }
  }
}

function aggregateDamageAndSupport(trials: readonly TrialResult[]): {
  dmgDealt: Map<number, number>;
  dmgReceived: Map<number, number>;
  healing: Map<number, number>;
  support: Map<number, number>;
} {
  const dmgDealt = new Map<number, number>();
  const dmgReceived = new Map<number, number>();
  const healing = new Map<number, number>();
  const support = new Map<number, number>();
  for (const trial of trials) {
    accumulateTypedArray(dmgDealt, trial.damageStats.dealtByType);
    accumulateTypedArray(dmgReceived, trial.damageStats.receivedByType);
    accumulateTypedArray(healing, trial.supportStats.healingByType);
    accumulateSupportScore(support, trial.supportStats);
  }
  return { dmgDealt, dmgReceived, healing, support };
}

// ─── Unit Summary ────────────────────────────────────────────────

function findTopIndex(matrix: KillMatrix, typeIdx: number, mode: 'victim' | 'threat'): number | null {
  let best = 0;
  let bestIdx: number | null = null;
  for (let i = 0; i < matrix.size; i++) {
    let val: number;
    if (mode === 'victim') {
      val = matrix.data[typeIdx]?.[i] ?? 0;
    } else {
      val = matrix.data[i]?.[typeIdx] ?? 0;
    }
    if (val > best) {
      best = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function perCost(value: number, spawned: number, cost: number): number {
  return cost > 0 && spawned > 0 ? value / (spawned * cost) : 0;
}

interface UnitSummaryContext {
  readonly presenceWins: Map<number, { wins: number; total: number }>;
  readonly totalBattleTrials: number;
  readonly killMatrix: KillMatrix;
  readonly dmgDealt: Map<number, number>;
  readonly dmgReceived: Map<number, number>;
  readonly healing: Map<number, number>;
  readonly support: Map<number, number>;
  readonly totalLifespan: Map<number, number>;
  readonly killContextAgg: Map<number, Int32Array>;
}

function buildUnitSummaryEntry(
  typeIdx: number,
  t: { spawned: number; kills: number; deaths: number; survived: number },
  ctx: UnitSummaryContext,
  deathsByContext: Int32Array,
): UnitTypeSummary {
  const { presenceWins, totalBattleTrials, killMatrix, dmgDealt, dmgReceived, healing, support } = ctx;
  const typeInfo = TYPES[typeIdx];
  const pw = presenceWins.get(typeIdx);
  const presenceTotal = pw?.total ?? 0;
  const presenceWinCount = pw?.wins ?? 0;
  // 各battle試合は2チーム参加・勝者は最大1チーム。
  // absenceTotal = 全「チーム×試合」数 - この型が存在した回数 = 不在チーム×試合の数。
  // absenceWinCount = 全勝利数(=試合数) - この型を含むチームの勝利数 = 不在チームの勝利数。
  const absenceTotal = totalBattleTrials * 2 - presenceTotal;
  const absenceWinCount = totalBattleTrials - presenceWinCount;
  const cost = typeInfo?.cost ?? 0;
  const totalDamageDealt = dmgDealt.get(typeIdx) ?? 0;
  const totalHealing = healing.get(typeIdx) ?? 0;
  const wrPresent = safeRate(presenceWinCount, presenceTotal);
  const wrAbsent = safeRate(absenceWinCount, absenceTotal);

  return {
    typeIndex: typeIdx,
    name: typeName(typeIdx),
    totalSpawned: t.spawned,
    totalKills: t.kills,
    totalDeaths: t.deaths,
    totalSurvived: t.survived,
    survivalRate: safeRate(t.survived, t.spawned),
    kd: computeKD(t.kills, t.deaths),
    cost,
    killsPerCost: perCost(t.kills, t.spawned, cost),
    winRateWhenPresent: wrPresent,
    winRateWhenAbsent: wrAbsent,
    winDelta: presenceTotal > 0 ? wrPresent - wrAbsent : 0,
    topVictimType: findTopIndex(killMatrix, typeIdx, 'victim'),
    topThreatType: findTopIndex(killMatrix, typeIdx, 'threat'),
    totalDamageDealt,
    totalDamageReceived: dmgReceived.get(typeIdx) ?? 0,
    damagePerCost: perCost(totalDamageDealt, t.spawned, cost),
    totalHealing,
    supportScore: totalHealing + (support.get(typeIdx) ?? 0),
    avgLifespan: t.deaths > 0 ? (ctx.totalLifespan.get(typeIdx) ?? 0) / t.deaths : 0,
    deathsByContext,
  };
}

function computeUnitSummary(trials: readonly TrialResult[], killMatrix: KillMatrix): UnitTypeSummary[] {
  const totals = aggregateKD(trials);
  const presenceWins = aggregatePresenceWins(trials);
  const totalBattleTrials = trials.filter(isBattleWithWinner).length;
  const { dmgDealt, dmgReceived, healing, support } = aggregateDamageAndSupport(trials);
  const totalLifespan = aggregateLifespan(trials);
  const killContextAgg = aggregateKillContext(trials);
  const emptyCtx = new Int32Array(KILL_CONTEXT_COUNT);

  const ctx: UnitSummaryContext = {
    presenceWins,
    totalBattleTrials,
    killMatrix,
    dmgDealt,
    dmgReceived,
    healing,
    support,
    totalLifespan,
    killContextAgg,
  };

  const result: UnitTypeSummary[] = [];
  for (const [typeIdx, t] of totals) {
    result.push(buildUnitSummaryEntry(typeIdx, t, ctx, killContextAgg.get(typeIdx) ?? emptyCtx));
  }

  result.sort((a, b) => {
    // Infinity 同士の減算で NaN になることを回避
    if (a.kd === b.kd) {
      return 0;
    }
    if (a.kd === Number.POSITIVE_INFINITY) {
      return -1;
    }
    if (b.kd === Number.POSITIVE_INFINITY) {
      return 1;
    }
    return b.kd - a.kd;
  });
  return result;
}

// ─── Summary ─────────────────────────────────────────────────────

export function computeSummary(config: BatchConfig, trials: readonly TrialResult[]): BatchSummary {
  const winCounts: Record<string, number> = {};
  let totalSteps = 0;
  let totalComplexity = 0;
  let totalSpatial = 0;
  let spatialCount = 0;
  let totalKillSeqEntropy = 0;

  for (const t of trials) {
    totalSteps += t.steps;
    totalComplexity += t.complexity;
    totalKillSeqEntropy += t.killSequenceEntropy;

    const key = t.winner === null ? 'timeout' : String(t.winner);
    winCounts[key] = (winCounts[key] ?? 0) + 1;

    for (const s of t.snapshots) {
      totalSpatial += s.spatial;
      spatialCount++;
    }
  }

  const n = trials.length || 1;
  const killMatrix = aggregateKillMatrix(trials);
  return {
    config,
    trials,
    stats: {
      avgSteps: totalSteps / n,
      avgComplexity: totalComplexity / n,
      winRates: Object.fromEntries(Object.entries(winCounts).map(([k, v]) => [k, v / n])),
      avgSpatialEntropy: spatialCount > 0 ? totalSpatial / spatialCount : 0,
      avgKillSequenceEntropy: totalKillSeqEntropy / n,
    },
    unitSummary: computeUnitSummary(trials, killMatrix),
    killMatrix,
    synergyPairs: computeSynergyPairs(trials),
  };
}
