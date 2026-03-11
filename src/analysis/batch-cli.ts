/**
 * バッチシミュレーション — CLI引数パース + エントリーポイント
 *
 * 使い方:
 *   bun run src/analysis/batch-cli.ts                         # デフォルト 10 試合
 *   bun run src/analysis/batch-cli.ts --trials 50             # 50 試合
 *   bun run src/analysis/batch-cli.ts --mode melee --teams 3  # 3勢力メレー
 *   bun run src/analysis/batch-cli.ts --seed 42               # 固定シード
 *   bun run src/analysis/batch-cli.ts --out results.json      # JSON 出力
 *   bun run src/analysis/batch-cli.ts --maxSteps 5000         # 最大ステップ数
 *   bun run src/analysis/batch-cli.ts --sequential            # 逐次実行（デフォルトは並列）
 */

import { createRng } from '../state.ts';
import type { UnitTypeIndex } from '../types.ts';
import type { FleetComposition } from '../types-fleet.ts';
import { findTypeIndex } from '../unit-type-accessors.ts';
import { outputSummary, runBatch, runBatchParallel } from './batch-runner.ts';
import type { BatchConfig } from './batch-types.ts';

/** 3 分 @ 60fps */
const DEFAULT_MAX_STEPS = 10800;
/** 1 秒ごと */
const DEFAULT_SNAPSHOT_INTERVAL = 60;

import { collectArgPairs, parseIntArg } from './cli-utils.ts';

/** @example parseFleetSpec("Fighter:10,Cruiser:5,Healer:3") */
export function parseFleetArg(value: string): FleetComposition {
  const entries: { type: UnitTypeIndex; count: number }[] = [];
  for (const part of value.split(',')) {
    const [name, countStr] = part.split(':');
    if (!name || !countStr) {
      continue;
    }
    const typeIdx = findTypeIndex(name);
    if (typeIdx === undefined) {
      continue;
    }
    const count = Number.parseInt(countStr, 10);
    if (Number.isNaN(count) || count <= 0) {
      continue;
    }
    entries.push({ type: typeIdx, count });
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

if (import.meta.main) {
  (async () => {
    const argv = process.argv.slice(2);
    const sequential = argv.some((a) => a === '--sequential');
    const filteredArgv = argv.filter((a) => a !== '--sequential');
    const config = parseArgs(filteredArgv, createRng);

    const summary = sequential ? runBatch(config) : await runBatchParallel(config);
    await outputSummary(summary, config.outFile);
  })().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
