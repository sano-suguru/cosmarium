/**
 * ラウンドロビントーナメント — 全ユニット型のモノタイプ艦隊同士を総当たり対戦
 *
 * 使い方:
 *   bun run src/analysis/roundrobin.ts                          # デフォルト
 *   bun run src/analysis/roundrobin.ts --budget 30 --trials 10  # 予算・試行回数指定
 *   bun run src/analysis/roundrobin.ts --seed 42                # 固定シード
 *   bun run src/analysis/roundrobin.ts --maxSteps 5000          # 最大ステップ数
 *   bun run src/analysis/roundrobin.ts --out results.json       # JSON 出力
 */

import { SORTED_TYPE_INDICES } from '../fleet-cost.ts';
import { TYPES } from '../unit-types.ts';
import { collectArgPairs, parseIntArg, runTrial } from './batch.ts';
import type { BatchConfig } from './batch-types.ts';
import { typeName } from './batch-types.ts';

// ─── Types ────────────────────────────────────────────────────────

interface MatchupResult {
  readonly typeA: number;
  readonly typeB: number;
  readonly nameA: string;
  readonly nameB: string;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  readonly trials: number;
}

interface RoundRobinRanking {
  readonly typeIndex: number;
  readonly name: string;
  readonly totalWins: number;
  readonly totalLosses: number;
  readonly totalDraws: number;
  readonly totalMatches: number;
  readonly winRate: number;
  readonly strongAgainst: readonly string[];
  readonly weakAgainst: readonly string[];
}

interface RoundRobinSummary {
  readonly budget: number;
  readonly trialsPerMatchup: number;
  readonly seed: number;
  readonly matchups: readonly MatchupResult[];
  readonly rankings: readonly RoundRobinRanking[];
}

interface RoundRobinConfig {
  readonly budget: number;
  readonly trials: number;
  readonly seed: number;
  readonly maxSteps: number;
  readonly outFile: string | null;
  readonly createRng: (seed: number) => () => number;
}

// ─── Core ─────────────────────────────────────────────────────────

function buildMonoFleet(typeIndex: number, budget: number): { type: number; count: number }[] | null {
  const t = TYPES[typeIndex];
  if (!t || t.cost <= 0) {
    return null;
  }
  const count = Math.floor(budget / t.cost);
  if (count <= 0) {
    return null;
  }
  return [{ type: typeIndex, count }];
}

function runMatchup(typeA: number, typeB: number, config: RoundRobinConfig, matchIndex: number): MatchupResult | null {
  const fleetA = buildMonoFleet(typeA, config.budget);
  const fleetB = buildMonoFleet(typeB, config.budget);

  if (!fleetA || !fleetB) {
    return null;
  }

  let winsA = 0;
  let winsB = 0;
  let draws = 0;

  for (let t = 0; t < config.trials; t++) {
    const batchConfig: BatchConfig = {
      trials: 1,
      mode: 'battle',
      teams: 2,
      seed: config.seed + matchIndex * config.trials + t,
      budget: config.budget,
      maxSteps: config.maxSteps,
      snapshotInterval: config.maxSteps, // スナップショット不要（最小限に）
      outFile: null,
      fleets: [fleetA, fleetB],
      createRng: config.createRng,
    };

    const result = runTrial(0, batchConfig);
    if (result.winner === 0) {
      winsA++;
    } else if (result.winner === 1) {
      winsB++;
    } else {
      draws++;
    }
  }

  return {
    typeA,
    typeB,
    nameA: typeName(typeA),
    nameB: typeName(typeB),
    winsA,
    winsB,
    draws,
    trials: config.trials,
  };
}

interface TypeStats {
  wins: number;
  losses: number;
  draws: number;
  matches: number;
}

function ensureEntry(stats: Map<number, TypeStats>, affinities: Map<number, Map<number, number>>, typeIdx: number) {
  if (!stats.has(typeIdx)) {
    stats.set(typeIdx, { wins: 0, losses: 0, draws: 0, matches: 0 });
  }
  if (!affinities.has(typeIdx)) {
    affinities.set(typeIdx, new Map());
  }
}

function aggregateMatchups(matchups: readonly MatchupResult[]): {
  stats: Map<number, TypeStats>;
  affinities: Map<number, Map<number, number>>;
} {
  const stats = new Map<number, TypeStats>();
  const affinities = new Map<number, Map<number, number>>();

  for (const m of matchups) {
    ensureEntry(stats, affinities, m.typeA);
    ensureEntry(stats, affinities, m.typeB);

    const sA = stats.get(m.typeA);
    const sB = stats.get(m.typeB);
    if (sA) {
      sA.wins += m.winsA;
      sA.losses += m.winsB;
      sA.draws += m.draws;
      sA.matches += m.trials;
    }
    if (sB) {
      sB.wins += m.winsB;
      sB.losses += m.winsA;
      sB.draws += m.draws;
      sB.matches += m.trials;
    }

    affinities.get(m.typeA)?.set(m.typeB, m.winsA / m.trials);
    affinities.get(m.typeB)?.set(m.typeA, m.winsB / m.trials);
  }

  return { stats, affinities };
}

function classifyAffinities(aff: Map<number, number>): { strongAgainst: string[]; weakAgainst: string[] } {
  const strongAgainst: string[] = [];
  const weakAgainst: string[] = [];
  for (const [oppIdx, wr] of aff) {
    const oppName = typeName(oppIdx);
    if (wr >= 0.7) {
      strongAgainst.push(oppName);
    } else if (wr <= 0.3) {
      weakAgainst.push(oppName);
    }
  }
  return { strongAgainst, weakAgainst };
}

function computeRankings(matchups: readonly MatchupResult[]): RoundRobinRanking[] {
  const { stats, affinities } = aggregateMatchups(matchups);

  const rankings: RoundRobinRanking[] = [];
  for (const [typeIdx, s] of stats) {
    const aff = affinities.get(typeIdx);
    const { strongAgainst, weakAgainst } = aff ? classifyAffinities(aff) : { strongAgainst: [], weakAgainst: [] };

    rankings.push({
      typeIndex: typeIdx,
      name: typeName(typeIdx),
      totalWins: s.wins,
      totalLosses: s.losses,
      totalDraws: s.draws,
      totalMatches: s.matches,
      winRate: s.matches > 0 ? s.wins / s.matches : 0,
      strongAgainst,
      weakAgainst,
    });
  }

  rankings.sort((a, b) => b.winRate - a.winRate);
  return rankings;
}

export function runRoundRobin(config: RoundRobinConfig): RoundRobinSummary {
  const types = SORTED_TYPE_INDICES;
  const matchups: MatchupResult[] = [];
  let matchIndex = 0;
  const totalMatchups = (types.length * (types.length - 1)) / 2;

  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const typeA = types[i];
      const typeB = types[j];
      if (typeA === undefined || typeB === undefined) {
        continue;
      }
      const result = runMatchup(typeA, typeB, config, matchIndex);
      matchIndex++;
      if (!result) {
        continue;
      }
      matchups.push(result);
      console.error(
        `  [${matchups.length}/${totalMatchups}] ${result.nameA} vs ${result.nameB}: ${result.winsA}-${result.winsB}-${result.draws}`,
      );
    }
  }

  return {
    budget: config.budget,
    trialsPerMatchup: config.trials,
    seed: config.seed,
    matchups,
    rankings: computeRankings(matchups),
  };
}

// ─── Format ───────────────────────────────────────────────────────

function formatRoundRobin(summary: RoundRobinSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('===============================================');
  lines.push('  COSMARIUM ラウンドロビントーナメント');
  lines.push('===============================================');
  lines.push(`  予算: ${summary.budget} | 試行/組: ${summary.trialsPerMatchup} | シード: ${summary.seed}`);
  lines.push(`  対戦組数: ${summary.matchups.length}`);
  lines.push('');
  lines.push('  --- 勝率ランキング ---');
  lines.push('  ユニット        | 勝率   | 勝  | 負  | 分  | 得意な相手              | 苦手な相手');
  lines.push('  ----------------|--------|-----|-----|-----|-------------------------|-------------------------');

  for (const r of summary.rankings) {
    const name = r.name.padEnd(16);
    const wr = `${(r.winRate * 100).toFixed(1)}%`.padStart(6);
    const w = String(r.totalWins).padStart(3);
    const l = String(r.totalLosses).padStart(3);
    const d = String(r.totalDraws).padStart(3);
    const strong = r.strongAgainst.length > 0 ? r.strongAgainst.join(', ') : '-';
    const weak = r.weakAgainst.length > 0 ? r.weakAgainst.join(', ') : '-';
    lines.push(`  ${name}| ${wr} | ${w} | ${l} | ${d} | ${strong.padEnd(23)} | ${weak}`);
  }

  lines.push('===============================================');
  return lines.join('\n');
}

// ─── CLI ──────────────────────────────────────────────────────────

function parseRoundRobinArgs(argv: readonly string[], createRng: (seed: number) => () => number): RoundRobinConfig {
  const pairs = collectArgPairs(argv);

  return {
    budget: parseIntArg(pairs, '--budget', 30),
    trials: parseIntArg(pairs, '--trials', 10),
    seed: parseIntArg(pairs, '--seed', 42),
    maxSteps: parseIntArg(pairs, '--maxSteps', 10800),
    outFile: pairs.get('--out') ?? null,
    createRng,
  };
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('roundrobin')) {
  (async () => {
    const { seedRng, state } = await import('../state.ts');
    const createRng = (seed: number) => {
      seedRng(seed);
      return state.rng;
    };
    const config = parseRoundRobinArgs(process.argv.slice(2), createRng);
    const summary = runRoundRobin(config);

    if (config.outFile) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(config.outFile, JSON.stringify(summary, null, 2));
      console.error(`結果を ${config.outFile} に保存しました`);
    } else {
      console.error(formatRoundRobin(summary));
    }
  })();
}
