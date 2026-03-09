/** バッチ Worker — createRng は Worker 側で import（関数はシリアライズ不可のため） */

import { createRng } from '../state.ts';
import { runTrial } from './batch.ts';
import { serializeTrialResult, type WorkerMessage, type WorkerResult } from './batch-types.ts';

declare const self: Worker;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { trialIndex, config } = e.data;
  const fullConfig = { ...config, createRng };
  const result = runTrial(trialIndex, fullConfig);
  const response: WorkerResult = { result: serializeTrialResult(result) };
  self.postMessage(response);
};
