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
import { initBattle, initMelee } from '../simulation/init.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { stepOnce } from '../simulation/update.ts';

import type { FleetComposition, Team } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { formatSummary } from './batch-format.ts';
import { computeSummary } from './batch-summary.ts';
import {
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
  KillTracker,
  LifespanTracker,
  TrialResult,
  TrialSnapshot,
} from './batch-types.ts';
import type { BattleStateSnapshot } from './entropy.ts';
import { battleComplexity, fleetDiversity, ngramEntropy, rleCompressionRatio, spatialEntropy } from './entropy.ts';

// ─── Snapshot Collection ──────────────────────────────────────────

const _posBuf: number[] = [];

/** 座標を再利用バッファに収集。返り値は次の呼び出しまで有効 */
function collectPositions(activeTeams: number): number[] {
  _posBuf.length = 0;
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.alive && u.team < activeTeams) {
      _posBuf.push(u.x, u.y);
    }
  }
  return _posBuf;
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
    initMelee(fleetCompositions, rng);
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
  let currentTime = 0;
  const unsubLifespan = installLifespanKillHook(lifespanTracker, () => currentTime);
  const ctxTracker = createKillContextTracker();
  const unsubCtx = installKillContextHook(ctxTracker);
  const spawnedByType = countSpawnedAndRegister(activeTeams, lifespanTracker);

  const gs = makeBatchGameLoopState(config.mode, activeTeams);
  const snapshots: TrialSnapshot[] = [];
  let winner: Team | 'draw' | null = null;
  let step = 0;

  for (; step < config.maxSteps; step++) {
    const now = step * SIM_DT;
    currentTime = now;
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

/** @example parseFleetSpec("Fighter:10,Cruiser:5,Healer:3") */
function parseFleetArg(value: string): FleetComposition {
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

function logProgress(i: number, total: number, result: TrialResult, logger: (msg: string) => void): void {
  logger(`  [${i + 1}/${total}] seed=${result.seed} winner=${result.winner} steps=${result.steps}`);
}

// ─── Main ─────────────────────────────────────────────────────────

export function runBatch(config: BatchConfig): BatchSummary {
  const trials: TrialResult[] = [];
  const log = config.logger ?? console.error;

  for (let i = 0; i < config.trials; i++) {
    const result = runTrial(i, config);
    trials.push(result);
    logProgress(i, config.trials, result, log);
  }

  return computeSummary(config, trials);
}

if (import.meta.main) {
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
