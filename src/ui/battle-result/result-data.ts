import type { MeleeResult } from '../../melee-tracker.ts';
import type { RoundResult, RunResult, RunStatus } from '../../types.ts';

export type ResultData =
  | { readonly type: 'round'; readonly roundResult: RoundResult; readonly runStatus: RunStatus }
  | { readonly type: 'run'; readonly runResult: RunResult }
  | { readonly type: 'melee'; readonly meleeResult: MeleeResult };
