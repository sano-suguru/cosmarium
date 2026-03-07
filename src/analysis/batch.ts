/**
 * 自動対戦バッチスクリプト — エントロピー時系列データ収集
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
 * 出力: 各試合の時系列スナップショット + サマリー統計を stdout or JSON ファイルに出力
 */

import { SIM_DT, WORLD_SIZE } from '../constants.ts';
import { DEFAULT_BUDGET } from '../fleet-cost.ts';
import { getUnitHWM, teamUnitCounts, unit } from '../pools.ts';
import { generateEnemyFleet } from '../simulation/enemy-fleet.ts';
import { initBattle, initMelee } from '../simulation/init.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { stepOnce } from '../simulation/update.ts';
import { seedRng, state } from '../state.ts';
import type { Team } from '../types.ts';
import type { BattleStateSnapshot } from './entropy.ts';
import { battleComplexity, fleetDiversity, rleCompressionRatio, spatialEntropy } from './entropy.ts';

// ─── Types ────────────────────────────────────────────────────────

interface BatchConfig {
  readonly trials: number;
  readonly mode: 'battle' | 'melee';
  readonly teams: number;
  readonly seed: number;
  readonly budget: number;
  readonly maxSteps: number;
  readonly snapshotInterval: number;
  readonly outFile: string | null;
}

interface TrialSnapshot {
  readonly step: number;
  readonly elapsed: number;
  readonly teamCounts: readonly number[];
  readonly spatial: number;
  readonly positionRle: number;
}

interface TrialResult {
  readonly trialIndex: number;
  readonly seed: number;
  readonly winner: number | 'draw' | null;
  readonly steps: number;
  readonly elapsed: number;
  readonly fleetDiversities: readonly number[];
  readonly snapshots: readonly TrialSnapshot[];
  readonly complexity: number;
}

interface BatchSummary {
  readonly config: BatchConfig;
  readonly trials: readonly TrialResult[];
  readonly stats: {
    readonly avgSteps: number;
    readonly avgComplexity: number;
    readonly winRates: Record<string, number>;
    readonly avgSpatialEntropy: number;
  };
}

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

function collectTeamCounts(activeTeams: number): number[] {
  const counts: number[] = [];
  for (let t = 0; t < activeTeams; t++) {
    counts.push(teamUnitCounts[t as Team] ?? 0);
  }
  return counts;
}

function takeSnapshot(step: number, elapsed: number, activeTeams: number): TrialSnapshot {
  const positions = collectPositions(activeTeams);
  const spatial = spatialEntropy(positions, WORLD_SIZE, 8);
  const positionRle = rleCompressionRatio(positions, 0.01);
  return {
    step,
    elapsed,
    teamCounts: collectTeamCounts(activeTeams),
    spatial,
    positionRle,
  };
}

// ─── Trial Execution ──────────────────────────────────────────────

function makeBatchGameLoopState(mode: 'battle' | 'melee', activeTeams: number): GameLoopState {
  return {
    codexOpen: false,
    battlePhase: mode === 'battle' ? 'battle' : 'melee',
    activeTeamCount: activeTeams,
    updateCodexDemo: () => undefined,
    get reinforcementTimer() {
      return state.reinforcementTimer;
    },
    set reinforcementTimer(v: number) {
      state.reinforcementTimer = v;
    },
  };
}

function runTrial(trialIndex: number, config: BatchConfig): TrialResult {
  const trialSeed = config.seed + trialIndex;
  seedRng(trialSeed);
  const rng = state.rng;

  const activeTeams = config.mode === 'battle' ? 2 : config.teams;
  const fleetDiversities: number[] = [];

  if (config.mode === 'battle') {
    const { fleet: playerFleet } = generateEnemyFleet(config.budget, rng);
    const { fleet: enemyFleet } = generateEnemyFleet(config.budget, rng);
    fleetDiversities.push(fleetDiversity(playerFleet), fleetDiversity(enemyFleet));
    initBattle(playerFleet, enemyFleet, rng);
  } else {
    initMelee(activeTeams, config.budget, rng);
  }

  const gs = makeBatchGameLoopState(config.mode, activeTeams);
  const snapshots: TrialSnapshot[] = [];
  let winner: Team | 'draw' | null = null;
  let step = 0;

  for (; step < config.maxSteps; step++) {
    const now = step * SIM_DT;
    const result = stepOnce(SIM_DT, now, rng, gs);

    if (step % config.snapshotInterval === 0) {
      snapshots.push(takeSnapshot(step, now, activeTeams));
    }

    if (result !== null) {
      winner = result;
      snapshots.push(takeSnapshot(step, now, activeTeams));
      break;
    }
  }

  // battleComplexity 用の BattleStateSnapshot 変換
  const battleSnapshots: BattleStateSnapshot[] = snapshots.map((s) => ({
    teamCounts: s.teamCounts,
    teamKills: [], // バッチではキルログ未追跡（将来拡張可能）
    spatialEntropy: s.spatial,
  }));

  return {
    trialIndex,
    seed: trialSeed,
    winner,
    steps: step,
    elapsed: step * SIM_DT,
    fleetDiversities,
    snapshots,
    complexity: battleComplexity(battleSnapshots),
  };
}

// ─── Summary Statistics ───────────────────────────────────────────

function computeSummary(config: BatchConfig, trials: readonly TrialResult[]): BatchSummary {
  const winCounts: Record<string, number> = {};
  let totalSteps = 0;
  let totalComplexity = 0;
  let totalSpatial = 0;
  let spatialCount = 0;

  for (const t of trials) {
    totalSteps += t.steps;
    totalComplexity += t.complexity;

    const key = t.winner === null ? 'timeout' : String(t.winner);
    winCounts[key] = (winCounts[key] ?? 0) + 1;

    for (const s of t.snapshots) {
      totalSpatial += s.spatial;
      spatialCount++;
    }
  }

  const n = trials.length || 1;
  return {
    config,
    trials,
    stats: {
      avgSteps: totalSteps / n,
      avgComplexity: totalComplexity / n,
      winRates: Object.fromEntries(Object.entries(winCounts).map(([k, v]) => [k, v / n])),
      avgSpatialEntropy: spatialCount > 0 ? totalSpatial / spatialCount : 0,
    },
  };
}

// ─── CLI ──────────────────────────────────────────────────────────

function collectArgPairs(argv: readonly string[]): Map<string, string> {
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

function parseArgs(argv: readonly string[]): BatchConfig {
  const pairs = collectArgPairs(argv);
  const int = (key: string, fallback: number) => {
    const v = pairs.get(key);
    return v ? Number.parseInt(v, 10) : fallback;
  };

  return {
    trials: int('--trials', 10),
    mode: pairs.get('--mode') === 'melee' ? 'melee' : 'battle',
    teams: int('--teams', 3),
    seed: int('--seed', 12345),
    budget: int('--budget', DEFAULT_BUDGET),
    maxSteps: int('--maxSteps', 10800), // 3 分 @ 60fps
    snapshotInterval: int('--interval', 60), // 1 秒ごと
    outFile: pairs.get('--out') ?? null,
  };
}

function formatSummary(summary: BatchSummary): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  COSMARIUM バッチ対戦分析`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`  モード: ${summary.config.mode} | 試合数: ${summary.config.trials} | 予算: ${summary.config.budget}`);
  lines.push(`  シード: ${summary.config.seed} | 最大ステップ: ${summary.config.maxSteps}`);
  lines.push('───────────────────────────────────────────────────');
  lines.push(`  平均ステップ数:     ${summary.stats.avgSteps.toFixed(1)}`);
  lines.push(`  平均複雑性スコア:   ${summary.stats.avgComplexity.toFixed(4)}`);
  lines.push(`  平均空間エントロピー: ${summary.stats.avgSpatialEntropy.toFixed(4)}`);
  lines.push('───────────────────────────────────────────────────');
  lines.push('  勝率:');
  for (const [key, rate] of Object.entries(summary.stats.winRates)) {
    const LABELS: Record<string, string> = { draw: '引分', timeout: '時間切' };
    const label = LABELS[key] ?? `チーム${key}`;
    lines.push(`    ${label}: ${(rate * 100).toFixed(1)}%`);
  }
  lines.push('───────────────────────────────────────────────────');

  for (const trial of summary.trials) {
    let winLabel = `チーム${trial.winner}勝利`;
    if (trial.winner === null) {
      winLabel = '時間切';
    } else if (trial.winner === 'draw') {
      winLabel = '引分';
    }
    const divStr = trial.fleetDiversities.length > 0 ? trial.fleetDiversities.map((d) => d.toFixed(3)).join('/') : '-';
    lines.push(
      `  #${String(trial.trialIndex).padStart(3, '0')} | ${winLabel.padEnd(10)} | ${trial.steps.toString().padStart(5)}歩 | 複雑性=${trial.complexity.toFixed(3)} | 多様性=${divStr}`,
    );
  }

  lines.push('═══════════════════════════════════════════════════');
  return lines.join('\n');
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
  const config = parseArgs(process.argv.slice(2));
  const summary = runBatch(config);

  if (config.outFile) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(config.outFile, JSON.stringify(summary, null, 2));
    console.error(`結果を ${config.outFile} に保存しました`);
  } else {
    console.error(formatSummary(summary));
  }
}
