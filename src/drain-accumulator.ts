import { SIM_DT } from './constants.ts';

export const MAX_SIM_STEPS_PER_FRAME = 8;

/** アキュムレータを SIM_DT 刻みで消化し、残余を返す。MAX 到達時の未消化分は破棄（フレームスパイク対策） */
export function drainAccumulator(initial: number, stepFn: () => void): number {
  let remaining = initial;
  let steps = 0;
  while (remaining >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
    stepFn();
    remaining -= SIM_DT;
    steps++;
  }
  return remaining >= SIM_DT ? 0 : remaining;
}
