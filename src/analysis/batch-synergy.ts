/**
 * バッチ対戦システム — 艦隊プレゼンス・シナジー分析
 */

import type { FleetComposition } from '../types.ts';
import { UNIT_TYPE_COUNT } from '../unit-types.ts';
import type { SynergyPair, TrialResult } from './batch-types.ts';
import { typeName } from './batch-types.ts';

// ─── Presence Tracking ────────────────────────────────────────────

export function isBattleWithWinner(trial: TrialResult): trial is TrialResult & { readonly winner: number } {
  return trial.fleetCompositions.length === 2 && trial.winner !== null && trial.winner !== 'draw';
}

function recordFleetPresence(
  presenceWins: Map<number, { wins: number; total: number }>,
  fleet: FleetComposition,
  isWinner: boolean,
) {
  for (const entry of fleet) {
    if (entry.count <= 0) {
      continue;
    }
    let pw = presenceWins.get(entry.type);
    if (!pw) {
      pw = { wins: 0, total: 0 };
      presenceWins.set(entry.type, pw);
    }
    pw.total++;
    if (isWinner) {
      pw.wins++;
    }
  }
}

/** battle勝敗付きtrialの各チーム艦隊を列挙するヘルパー */
function forEachBattleFleet(
  trials: readonly TrialResult[],
  cb: (fleet: FleetComposition, isWinner: boolean) => void,
): void {
  for (const trial of trials) {
    if (!isBattleWithWinner(trial)) {
      continue;
    }
    const winnerTeam = trial.winner;
    for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
      const fleet = trial.fleetCompositions[teamIdx];
      if (!fleet) {
        continue;
      }
      cb(fleet, teamIdx === winnerTeam);
    }
  }
}

export function aggregatePresenceWins(trials: readonly TrialResult[]): Map<number, { wins: number; total: number }> {
  const presenceWins = new Map<number, { wins: number; total: number }>();
  forEachBattleFleet(trials, (fleet, isWinner) => {
    recordFleetPresence(presenceWins, fleet, isWinner);
  });
  return presenceWins;
}

// ─── Synergy Pairs ──────────────────────────────────────────────

interface PairStats {
  wins: number;
  total: number;
}

function getFleetTypes(fleet: FleetComposition): number[] {
  const types: number[] = [];
  for (const entry of fleet) {
    if (entry.count > 0) {
      types.push(entry.type);
    }
  }
  return types;
}

/** ペアエンコードに使うビット幅。各インデックスが PAIR_BITS ビットに収まる前提 */
const PAIR_BITS = 8;
const PAIR_MASK = (1 << PAIR_BITS) - 1;

if (UNIT_TYPE_COUNT > PAIR_MASK) {
  throw new Error(
    `UNIT_TYPE_COUNT (${UNIT_TYPE_COUNT}) exceeds PAIR_BITS capacity (${PAIR_MASK}). Increase PAIR_BITS.`,
  );
}

function pairKey(a: number, b: number): number {
  return a < b ? (a << PAIR_BITS) | b : (b << PAIR_BITS) | a;
}

function incrementStats(stats: PairStats, isWinner: boolean) {
  stats.total++;
  if (isWinner) {
    stats.wins++;
  }
}

function ensurePairStats<K>(map: Map<K, PairStats>, key: K): PairStats {
  let s = map.get(key);
  if (!s) {
    s = { wins: 0, total: 0 };
    map.set(key, s);
  }
  return s;
}

function recordFleetSynergy(
  coStats: Map<number, PairStats>,
  soloStats: Map<number, PairStats>,
  typeArr: readonly number[],
  isWinner: boolean,
) {
  for (const t of typeArr) {
    incrementStats(ensurePairStats(soloStats, t), isWinner);
  }
  for (let i = 0; i < typeArr.length; i++) {
    for (let j = i + 1; j < typeArr.length; j++) {
      const a = typeArr[i];
      const b = typeArr[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      const key = pairKey(a, b);
      incrementStats(ensurePairStats(coStats, key), isWinner);
    }
  }
}

function collectSynergyStats(trials: readonly TrialResult[]): {
  coStats: Map<number, PairStats>;
  soloStats: Map<number, PairStats>;
} {
  const coStats = new Map<number, PairStats>();
  const soloStats = new Map<number, PairStats>();
  forEachBattleFleet(trials, (fleet, isWinner) => {
    recordFleetSynergy(coStats, soloStats, getFleetTypes(fleet), isWinner);
  });
  return { coStats, soloStats };
}

function winRate(stats: PairStats | undefined): number {
  return stats && stats.total > 0 ? stats.wins / stats.total : 0;
}

/** シナジー評価に必要な最小共起回数。サンプル数が少なすぎる組み合わせを除外する */
export const MIN_CO_COUNT = 5;

function buildSynergyPairs(
  coStats: Map<number, PairStats>,
  soloStats: Map<number, PairStats>,
  minCoCount: number = MIN_CO_COUNT,
): SynergyPair[] {
  const results: SynergyPair[] = [];
  for (const [key, co] of coStats) {
    if (co.total < minCoCount) {
      continue;
    }
    const a = (key >> PAIR_BITS) & PAIR_MASK;
    const b = key & PAIR_MASK;
    const soloAWinRate = winRate(soloStats.get(a));
    const soloBWinRate = winRate(soloStats.get(b));
    const coWinRate = co.wins / co.total;
    results.push({
      typeA: a,
      typeB: b,
      nameA: typeName(a),
      nameB: typeName(b),
      coWinRate,
      soloAWinRate,
      soloBWinRate,
      synergy: coWinRate - Math.max(soloAWinRate, soloBWinRate),
      coCount: co.total,
    });
  }
  results.sort((a, b) => b.synergy - a.synergy);
  return results;
}

export function computeSynergyPairs(trials: readonly TrialResult[], minCoCount?: number): SynergyPair[] {
  const { coStats, soloStats } = collectSynergyStats(trials);
  return buildSynergyPairs(coStats, soloStats, minCoCount);
}
