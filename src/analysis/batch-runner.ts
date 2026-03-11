/**
 * バッチシミュレーション — 実行・進捗・出力ロジック
 */

import { runTrial } from './batch.ts';
import { formatSummary } from './batch-format.ts';
import { computeSummary } from './batch-summary.ts';
import type {
  BatchConfig,
  BatchSummary,
  SerializableBatchConfig,
  TrialResult,
  WorkerMessage,
  WorkerResult,
} from './batch-types.ts';
import { deserializeTrialResult } from './batch-types.ts';

function logProgress(i: number, total: number, result: TrialResult, logger: (msg: string) => void): void {
  logger(`  [${i + 1}/${total}] seed=${result.seed} winner=${result.winner} steps=${result.steps}`);
}

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

export async function runBatchParallel(config: BatchConfig): Promise<BatchSummary> {
  const os = await import('node:os');
  const workerCount = Math.min(os.cpus().length, 8, config.trials);
  const log = config.logger ?? console.error;

  log(`並列実行: ${workerCount} workers × ${config.trials} trials`);

  const serializableConfig: SerializableBatchConfig = {
    trials: config.trials,
    mode: config.mode,
    teams: config.teams,
    seed: config.seed,
    maxSteps: config.maxSteps,
    snapshotInterval: config.snapshotInterval,
    outFile: config.outFile,
    fleets: config.fleets,
  };

  const results: TrialResult[] = new Array(config.trials);
  let nextTrial = 0;

  // Bun の Worker は file: URL + .ts 直接指定に対応（Node.js では不可）
  const workerUrl = new URL('./batch-worker.ts', import.meta.url).href;

  const workers: Worker[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(new Worker(workerUrl));
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let completed = 0;
      let failed = false;

      function terminateAll() {
        for (const w of workers) {
          w.terminate();
        }
      }

      function dispatch(worker: Worker) {
        if (failed || nextTrial >= config.trials) {
          return;
        }

        const trialIndex = nextTrial++;
        const msg: WorkerMessage = { trialIndex, config: serializableConfig };

        worker.onerror = (e: ErrorEvent) => {
          if (failed) {
            return;
          }
          failed = true;
          terminateAll();
          reject(new Error(`Worker error (trial ${trialIndex}): ${e.message}`));
        };

        worker.onmessage = (e: MessageEvent<WorkerResult>) => {
          if (failed) {
            return;
          }
          const deserialized = deserializeTrialResult(e.data.result);
          results[trialIndex] = deserialized;
          logProgress(trialIndex, config.trials, deserialized, log);
          completed++;
          if (completed >= config.trials) {
            resolve();
          } else {
            dispatch(worker);
          }
        };

        worker.postMessage(msg);
      }

      for (const worker of workers) {
        dispatch(worker);
      }
    });
  } finally {
    for (const worker of workers) {
      worker.terminate();
    }
  }

  return computeSummary(config, results);
}

export async function outputSummary(summary: BatchSummary, outFile: string | null) {
  if (outFile) {
    const { writeFileSync } = await import('node:fs');
    const replacer = (_key: string, value: unknown) => (value === Number.POSITIVE_INFINITY ? 'Infinity' : value);
    writeFileSync(outFile, JSON.stringify(summary, replacer, 2));
    console.error(`結果を ${outFile} に保存しました`);
  } else {
    process.stdout.write(`${formatSummary(summary)}\n`);
  }
}
