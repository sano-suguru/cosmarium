/**
 * 自動対戦バッチスクリプト — エントロピー時系列データ収集 + ユニット別戦績分析
 *
 * 使い方:
 *   bun run src/analysis/batch.ts                         # デフォルト 10 試合
 *   bun run src/analysis/batch.ts --trials 50             # 50 試合
 *   bun run src/analysis/batch.ts --mode melee --teams 3  # 3勢力メレー
 *   bun run src/analysis/batch.ts --seed 42               # 固定シード
 *   bun run src/analysis/batch.ts --out results.json      # JSON 出力
 *   bun run src/analysis/batch.ts --budget 100            # 予算指定
 *   bun run src/analysis/batch.ts --maxSteps 5000         # 最大ステップ数
 *
 * 出力: 各試合の時系列スナップショット + サマリー統計 + ユニット別戦績を stdout or JSON ファイルに出力
 */

import { SIM_DT, WORLD_SIZE } from '../constants.ts';
import { DEFAULT_BUDGET } from '../fleet-cost.ts';

/** 3 分 @ 60fps */
const DEFAULT_MAX_STEPS = 10800;
/** 1 秒ごと */
const DEFAULT_SNAPSHOT_INTERVAL = 60;

import { getUnitHWM, teamUnitCounts, unit } from '../pools.ts';
import { generateEnemyFleet } from '../simulation/enemy-fleet.ts';
import { setCurrentSimTime } from '../simulation/hooks.ts';
import { initBattle, initMelee } from '../simulation/init.ts';
import { KILL_CONTEXT_COUNT } from '../simulation/on-kill-effects.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { stepOnce } from '../simulation/update.ts';

import type { FleetComposition, Team } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { formatSummary } from './batch-format.ts';
import { aggregatePresenceWins, computeSynergyPairs, isBattleWithWinner } from './batch-synergy.ts';
import {
  aggregateKillContext,
  aggregateLifespan,
  collectUnitStats,
  createDamageTracker,
  createKillContextTracker,
  createKillSequenceTracker,
  createKillTracker,
  createLifespanTracker,
  createSupportTracker,
  installDamageHook,
  installKillContextHook,
  installKillHook,
  installKillSequenceHook,
  installLifespanKillHook,
  installSupportHook,
} from './batch-tracking.ts';
import type {
  BatchConfig,
  BatchSummary,
  KillMatrix,
  KillTracker,
  LifespanTracker,
  SupportTracker,
  TrialResult,
  TrialSnapshot,
  UnitTypeSummary,
} from './batch-types.ts';
import { typeName } from './batch-types.ts';
import type { BattleStateSnapshot } from './entropy.ts';
import { battleComplexity, fleetDiversity, ngramEntropy, rleCompressionRatio, spatialEntropy } from './entropy.ts';

// ─── Snapshot Collection ──────────────────────────────────────────

function collectPositions(activeTeams: number): number[] {
  const positions: number[] = [];
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.alive && u.team < activeTeams) {
      positions.push(u.x, u.y);
    }
  }
  return positions;
}

function collectTeamCounts(activeTeams: number): Int32Array {
  const counts = new Int32Array(activeTeams);
  for (let t = 0; t < activeTeams; t++) {
    counts[t] = teamUnitCounts[t as Team] ?? 0;
  }
  return counts;
}

function takeSnapshot(step: number, elapsed: number, activeTeams: number, tracker: KillTracker): TrialSnapshot {
  const positions = collectPositions(activeTeams);
  const spatial = spatialEntropy(positions, WORLD_SIZE, 8);
  const positionRle = rleCompressionRatio(positions, 0.01);
  return {
    step,
    elapsed,
    teamCounts: collectTeamCounts(activeTeams),
    teamKills: tracker.teamKills.slice(0, activeTeams),
    spatial,
    positionRle,
  };
}

// ─── Unit Count by Type ──────────────────────────────────────────

/** 初期ユニット数カウント + lifespan 登録を1回のプール走査で行う */
function countSpawnedAndRegister(activeTeams: number, lifespanTracker: LifespanTracker): Int32Array {
  const counts = new Int32Array(TYPES.length);
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.team < activeTeams) {
      counts[u.type] = (counts[u.type] ?? 0) + 1;
      if (u.alive) {
        lifespanTracker.spawnTimes.set(i, 0);
      }
    }
  }
  return counts;
}

function countSurvivorsByType(activeTeams: number): Int32Array {
  const counts = new Int32Array(TYPES.length);
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.team < activeTeams && u.alive) {
      counts[u.type] = (counts[u.type] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── Trial Execution ──────────────────────────────────────────────

function makeBatchGameLoopState(mode: 'battle' | 'melee', activeTeams: number): GameLoopState {
  let reinforcementTimer = 0;
  return {
    codexOpen: false,
    battlePhase: mode === 'battle' ? 'battle' : 'melee',
    activeTeamCount: activeTeams,
    updateCodexDemo: () => undefined,
    get reinforcementTimer() {
      return reinforcementTimer;
    },
    set reinforcementTimer(v: number) {
      reinforcementTimer = v;
    },
  };
}

function setupFleets(
  config: BatchConfig,
  rng: () => number,
): { fleetDiversities: number[]; fleetCompositions: FleetComposition[]; activeTeams: number } {
  const activeTeams = config.mode === 'battle' ? 2 : config.teams;
  const fleetDiversities: number[] = [];
  const fleetCompositions: FleetComposition[] = [];

  if (config.mode === 'battle') {
    const playerFleet = config.fleets?.[0] ?? generateEnemyFleet(config.budget, rng).fleet;
    const enemyFleet = config.fleets?.[1] ?? generateEnemyFleet(config.budget, rng).fleet;
    fleetDiversities.push(fleetDiversity(playerFleet), fleetDiversity(enemyFleet));
    fleetCompositions.push(playerFleet, enemyFleet);
    initBattle(playerFleet, enemyFleet, rng);
  } else {
    for (let t = 0; t < activeTeams; t++) {
      const fleet = config.fleets?.[t] ?? generateEnemyFleet(config.budget, rng).fleet;
      fleetDiversities.push(fleetDiversity(fleet));
      fleetCompositions.push(fleet);
    }
    initMelee(activeTeams, config.budget, rng);
  }

  return { fleetDiversities, fleetCompositions, activeTeams };
}

export function runTrial(trialIndex: number, config: BatchConfig): TrialResult {
  const trialSeed = config.seed + trialIndex;
  const rng = config.createRng(trialSeed);

  const { fleetDiversities, fleetCompositions, activeTeams } = setupFleets(config, rng);

  const tracker = createKillTracker();
  const unsubKill = installKillHook(tracker);
  const dmgTracker = createDamageTracker();
  const unsubDmg = installDamageHook(dmgTracker);
  const supTracker = createSupportTracker();
  const unsubSup = installSupportHook(supTracker);
  const seqTracker = createKillSequenceTracker();
  const unsubSeq = installKillSequenceHook(seqTracker);
  const lifespanTracker = createLifespanTracker();
  const unsubLifespan = installLifespanKillHook(lifespanTracker);
  const ctxTracker = createKillContextTracker();
  const unsubCtx = installKillContextHook(ctxTracker);
  const spawnedByType = countSpawnedAndRegister(activeTeams, lifespanTracker);

  const gs = makeBatchGameLoopState(config.mode, activeTeams);
  const snapshots: TrialSnapshot[] = [];
  let winner: Team | 'draw' | null = null;
  let step = 0;

  for (; step < config.maxSteps; step++) {
    const now = step * SIM_DT;
    setCurrentSimTime(now);
    const result = stepOnce(SIM_DT, now, rng, gs);

    if (step % config.snapshotInterval === 0) {
      snapshots.push(takeSnapshot(step, now, activeTeams, tracker));
    }

    if (result !== null) {
      winner = result;
      snapshots.push(takeSnapshot(step, now, activeTeams, tracker));
      break;
    }
  }

  unsubKill();
  unsubDmg();
  unsubSup();
  unsubSeq();
  unsubLifespan();
  unsubCtx();

  const survivorsByType = countSurvivorsByType(activeTeams);

  const battleSnapshots: BattleStateSnapshot[] = snapshots.map((s) => ({
    teamCounts: s.teamCounts,
    teamKills: s.teamKills,
    spatialEntropy: s.spatial,
  }));

  const size = TYPES.length;
  return {
    trialIndex,
    seed: trialSeed,
    winner,
    steps: step,
    elapsed: step * SIM_DT,
    fleetDiversities,
    fleetCompositions,
    snapshots,
    complexity: battleComplexity(battleSnapshots),
    unitStats: collectUnitStats(spawnedByType, survivorsByType, tracker),
    killMatrix: { data: tracker.killMatrix, size },
    damageStats: { dealtByType: dmgTracker.dealtByType, receivedByType: dmgTracker.receivedByType },
    supportStats: {
      healingByType: supTracker.healingByType,
      ampApplications: supTracker.ampApplications,
      scrambleApplications: supTracker.scrambleApplications,
      catalystApplications: supTracker.catalystApplications,
    },
    killSequenceEntropy: ngramEntropy(seqTracker.sequence, 2),
    killContextStats: { contextCounts: ctxTracker.contextCounts },
    lifespanStats: { totalLifespan: lifespanTracker.totalLifespan },
  };
}

// ─── Summary Statistics ───────────────────────────────────────────

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
  return kills > 0 ? kills : 0;
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

  result.sort((a, b) => b.kd - a.kd);
  return result;
}

function computeSummary(config: BatchConfig, trials: readonly TrialResult[]): BatchSummary {
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

// ─── CLI ──────────────────────────────────────────────────────────

export function collectArgPairs(argv: readonly string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (let i = 0; i < argv.length - 1; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg?.startsWith('--') && next && !next.startsWith('--')) {
      pairs.set(arg, next);
      i++;
    }
  }
  return pairs;
}

export function parseIntArg(pairs: Map<string, string>, key: string, fallback: number): number {
  const v = pairs.get(key);
  return v ? Number.parseInt(v, 10) : fallback;
}

function parseFleetArg(value: string): FleetComposition {
  // フォーマット: "Fighter:10,Cruiser:5,Healer:3"
  const entries: { type: number; count: number }[] = [];
  for (const part of value.split(',')) {
    const [name, countStr] = part.split(':');
    if (!name || !countStr) {
      continue;
    }
    const typeIdx = TYPES.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
    if (typeIdx === -1) {
      continue;
    }
    entries.push({ type: typeIdx, count: Number.parseInt(countStr, 10) });
  }
  return entries;
}

function parseArgs(argv: readonly string[], createRng: (seed: number) => () => number): BatchConfig {
  const pairs = collectArgPairs(argv);

  const fleet0 = pairs.get('--fleet0');
  const fleet1 = pairs.get('--fleet1');

  const config: BatchConfig = {
    trials: parseIntArg(pairs, '--trials', 10),
    mode: pairs.get('--mode') === 'melee' ? 'melee' : 'battle',
    teams: parseIntArg(pairs, '--teams', 3),
    seed: parseIntArg(pairs, '--seed', 12345),
    budget: parseIntArg(pairs, '--budget', DEFAULT_BUDGET),
    maxSteps: parseIntArg(pairs, '--maxSteps', DEFAULT_MAX_STEPS),
    snapshotInterval: parseIntArg(pairs, '--interval', DEFAULT_SNAPSHOT_INTERVAL),
    outFile: pairs.get('--out') ?? null,
    createRng,
  };

  if (fleet0 || fleet1) {
    const fleets: FleetComposition[] = [];
    if (fleet0) {
      fleets.push(parseFleetArg(fleet0));
    }
    if (fleet1) {
      fleets.push(parseFleetArg(fleet1));
    }
    return { ...config, fleets };
  }

  return config;
}

// ─── Main ─────────────────────────────────────────────────────────

export function runBatch(config: BatchConfig): BatchSummary {
  const trials: TrialResult[] = [];

  for (let i = 0; i < config.trials; i++) {
    const result = runTrial(i, config);
    trials.push(result);
    // 進捗表示（stderr に出力してパイプを汚さない）
    console.error(`  [${i + 1}/${config.trials}] seed=${result.seed} winner=${result.winner} steps=${result.steps}`);
  }

  return computeSummary(config, trials);
}

// CLI エントリポイント（bun run src/analysis/batch.ts で直接実行時のみ動作）
if (typeof process !== 'undefined' && process.argv[1]?.includes('batch')) {
  (async () => {
    const { seedRng, state } = await import('../state.ts');
    const createRng = (seed: number) => {
      seedRng(seed);
      return state.rng;
    };
    const config = parseArgs(process.argv.slice(2), createRng);
    const summary = runBatch(config);

    if (config.outFile) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(config.outFile, JSON.stringify(summary, null, 2));
      console.error(`結果を ${config.outFile} に保存しました`);
    } else {
      console.error(formatSummary(summary));
    }
  })();
}
