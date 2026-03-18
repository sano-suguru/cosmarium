/**
 * ラウンドロビントーナメント — 全ユニット型のモノタイプ艦隊同士を総当たり対戦
 */

import { SORTED_TYPE_INDICES } from '../fleet-cost.ts';
import { createRng } from '../state.ts';
import type { UnitTypeIndex } from '../types.ts';
import type { FleetEntry } from '../types-fleet.ts';
import { TYPES } from '../unit-types.ts';
import { runTrial } from './batch.ts';
import type {
  BatchConfig,
  MatchupResult,
  RoundRobinConfig,
  RoundRobinRanking,
  RoundRobinSummary,
} from './batch-types.ts';
import { typeName } from './batch-types.ts';
import { formatRoundRobin, parseRoundRobinArgs } from './roundrobin-format.ts';

// Core

/** 指定コスト上限内でモノタイプ艦隊を構築。cost <= 0 または購入不可なら null */
function buildMonoFleet(typeIndex: UnitTypeIndex, costCap: number): FleetEntry[] | null {
  const t = TYPES[typeIndex];
  if (!t || t.cost <= 0) {
    return null;
  }
  const count = Math.floor(costCap / t.cost);
  if (count <= 0) {
    return null;
  }
  return [{ type: typeIndex, count }];
}

/** 2つのユニットタイプの全試行を実行し勝敗を集計する */
function runMatchup(
  typeA: UnitTypeIndex,
  typeB: UnitTypeIndex,
  fleetA: FleetEntry[],
  fleetB: FleetEntry[],
  config: RoundRobinConfig,
  matchIndex: number,
): MatchupResult {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;

  for (let t = 0; t < config.trials; t++) {
    const batchConfig: BatchConfig = {
      trials: 1,
      mode: 'battle',
      teams: 2,
      seed: config.seed + matchIndex * config.trials + t,
      maxSteps: config.maxSteps,
      snapshotInterval: config.maxSteps,
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

function ensureEntry(
  stats: Map<UnitTypeIndex, TypeStats>,
  affinities: Map<UnitTypeIndex, Map<UnitTypeIndex, number>>,
  typeIdx: UnitTypeIndex,
) {
  if (!stats.has(typeIdx)) {
    stats.set(typeIdx, { wins: 0, losses: 0, draws: 0, matches: 0 });
  }
  if (!affinities.has(typeIdx)) {
    affinities.set(typeIdx, new Map());
  }
}

function aggregateMatchups(matchups: readonly MatchupResult[]): {
  stats: Map<UnitTypeIndex, TypeStats>;
  affinities: Map<UnitTypeIndex, Map<UnitTypeIndex, number>>;
} {
  const stats = new Map<UnitTypeIndex, TypeStats>();
  const affinities = new Map<UnitTypeIndex, Map<UnitTypeIndex, number>>();

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

function classifyAffinities(aff: Map<UnitTypeIndex, number>): { strongAgainst: string[]; weakAgainst: string[] } {
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

/** 全対戦結果をユニットタイプ別の勝率ランキングに集約する */
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

/** コスト上限内で構築可能な全ユニットタイプの艦隊マップを生成 */
function buildFleetMap(costCap: number): Map<UnitTypeIndex, FleetEntry[]> {
  const fleetMap = new Map<UnitTypeIndex, FleetEntry[]>();
  for (const t of SORTED_TYPE_INDICES) {
    const fleet = buildMonoFleet(t, costCap);
    if (fleet) {
      fleetMap.set(t, fleet);
    }
  }
  return fleetMap;
}

function tryMatchup(
  validTypes: readonly UnitTypeIndex[],
  i: number,
  j: number,
  fleetMap: Map<UnitTypeIndex, FleetEntry[]>,
  config: RoundRobinConfig,
  matchIndex: number,
): MatchupResult | undefined {
  const typeA = validTypes[i];
  const typeB = validTypes[j];
  if (typeA === undefined || typeB === undefined) {
    return undefined;
  }
  const fleetA = fleetMap.get(typeA);
  const fleetB = fleetMap.get(typeB);
  if (!fleetA || !fleetB) {
    return undefined;
  }
  return runMatchup(typeA, typeB, fleetA, fleetB, config, matchIndex);
}

/** 全ペアの対戦を実行し結果リストを返す */
function runAllMatchups(
  validTypes: readonly UnitTypeIndex[],
  fleetMap: Map<UnitTypeIndex, FleetEntry[]>,
  config: RoundRobinConfig,
): MatchupResult[] {
  const log = config.logger ?? console.error;
  const totalMatchups = (validTypes.length * (validTypes.length - 1)) / 2;
  const matchups: MatchupResult[] = [];
  let matchIndex = 0;

  for (let i = 0; i < validTypes.length; i++) {
    for (let j = i + 1; j < validTypes.length; j++) {
      const result = tryMatchup(validTypes, i, j, fleetMap, config, matchIndex);
      if (!result) {
        continue;
      }
      matchIndex++;
      matchups.push(result);
      log(
        `  [${matchups.length}/${totalMatchups}] ${result.nameA} vs ${result.nameB}: ${result.winsA}-${result.winsB}-${result.draws}`,
      );
    }
  }
  return matchups;
}

/** 全ユニットタイプの総当たり対戦を実行し、勝率ランキングと相性データを返す */
export function runRoundRobin(config: RoundRobinConfig): RoundRobinSummary {
  const fleetMap = buildFleetMap(config.costCap);
  const validTypes = [...fleetMap.keys()];
  const matchups = runAllMatchups(validTypes, fleetMap, config);

  return {
    costCap: config.costCap,
    trialsPerMatchup: config.trials,
    seed: config.seed,
    matchups,
    rankings: computeRankings(matchups),
  };
}

if (import.meta.main) {
  const config = parseRoundRobinArgs(process.argv.slice(2), createRng);
  const summary = runRoundRobin(config);

  const outFile = config.outFile;
  if (outFile) {
    import('node:fs')
      .then(({ writeFileSync }) => {
        writeFileSync(outFile, JSON.stringify(summary, null, 2));
        console.error(`結果を ${outFile} に保存しました`);
      })
      .catch((e: unknown) => {
        console.error(e);
        process.exitCode = 1;
      });
  } else {
    console.error(formatRoundRobin(summary));
  }
}
