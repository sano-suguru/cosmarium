import type { MeleeResult } from '../melee-tracker.ts';
import { isRunActive, processRoundEnd } from '../run.ts';
import { state } from '../state.ts';
import type { FfaRoundEndInput, RoundEndInput } from '../types-fleet.ts';
import { meleeResultToBattleResult } from './ffa-round.ts';
import { playUiVisible$, resultData$ } from './signals.ts';

export function goToResult(input: RoundEndInput) {
  const outcome = processRoundEnd(input);
  state.gameState = 'result';
  playUiVisible$.value = false;

  if (outcome.type === 'runComplete') {
    resultData$.value = { type: 'run', runResult: outcome.runResult };
  } else {
    resultData$.value = { type: 'round', roundResult: outcome.roundResult, runStatus: outcome.status };
  }
}

export function goToMeleeResult(result: MeleeResult) {
  if (isRunActive()) {
    const ffaInput: FfaRoundEndInput = { roundType: 'ffa', battleResult: meleeResultToBattleResult(result) };
    goToResult(ffaInput);
    return;
  }
  state.gameState = 'result';
  playUiVisible$.value = false;
  resultData$.value = { type: 'melee', meleeResult: result };
}
