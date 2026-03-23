import { scheduleRound } from './round-schedule.ts';
import type { UnitTypeIndex } from './types.ts';
import { NO_TYPE } from './types.ts';
import type { RoundEndInput, RoundResult, RunResult, RunStatus } from './types-fleet.ts';
export const RUN_MAX_LIVES = 5;
export const RUN_WIN_TARGET = 10;

/** processRoundEnd の返値型 */
type RoundOutcome =
  | { readonly type: 'roundComplete'; readonly roundResult: RoundResult; readonly status: RunStatus }
  | { readonly type: 'runComplete'; readonly runResult: RunResult };

type RunState = {
  active: boolean;
  mothershipType: UnitTypeIndex;
  round: number;
  lives: number;
  wins: number;
  totalKills: number;
  pendingBonusCredits: number;
  roundResults: RoundResult[];
};

const run: RunState = {
  active: false,
  mothershipType: NO_TYPE,
  round: 0,
  lives: 0,
  wins: 0,
  totalKills: 0,
  pendingBonusCredits: 0,
  roundResults: [],
};

function clearRunFields(active: boolean, round: number, lives: number) {
  run.active = active;
  run.mothershipType = NO_TYPE;
  run.round = round;
  run.lives = lives;
  run.wins = 0;
  run.totalKills = 0;
  run.pendingBonusCredits = 0;
  run.roundResults.length = 0;
}

export function resetRun() {
  clearRunFields(true, 1, RUN_MAX_LIVES);
}

export function endRun() {
  clearRunFields(false, 0, 0);
}

export function isRunActive(): boolean {
  return run.active;
}

export function lockMothership(type: UnitTypeIndex): void {
  if (!run.active) {
    throw new Error('lockMothership called without active run');
  }
  if (type === NO_TYPE) {
    throw new Error('lockMothership called with NO_TYPE');
  }
  if (run.mothershipType !== NO_TYPE) {
    throw new Error('Mothership already locked for this run');
  }
  run.mothershipType = type;
}

export function getRunMothershipType(): UnitTypeIndex {
  if (!run.active) {
    throw new Error('getRunMothershipType called without active run');
  }
  if (run.mothershipType === NO_TYPE) {
    throw new Error('Mothership not yet locked for this run');
  }
  return run.mothershipType;
}

export function getRunInfo(): RunStatus | null {
  if (!run.active) {
    return null;
  }
  return {
    round: run.round,
    lives: run.lives,
    wins: run.wins,
    winTarget: RUN_WIN_TARGET,
    roundType: scheduleRound(run.round).roundType,
    pendingBonusCredits: run.pendingBonusCredits,
  };
}

function recordRoundResult(input: RoundEndInput): RoundResult {
  const scheduled = scheduleRound(run.round).roundType;
  if (scheduled !== input.roundType) {
    throw new Error(`Round ${run.round}: expected ${scheduled} but got ${input.roundType}`);
  }

  const br = input.battleResult;
  let roundResult: RoundResult;

  if (input.roundType === 'bonus') {
    roundResult = {
      roundType: 'bonus',
      round: run.round,
      elapsed: br.elapsed,
      enemyKills: br.enemyKills,
      bonusCredits: input.bonusReward.bonusCredits,
      bonusPct: input.bonusReward.bonusPct,
    };
  } else {
    roundResult = {
      roundType: input.roundType,
      round: run.round,
      victory: br.victory,
      elapsed: br.elapsed,
      playerSurvivors: br.playerSurvivors,
      enemyKills: br.enemyKills,
    };
    if (br.victory) {
      run.wins += 1;
    } else {
      run.lives -= 1;
    }
  }

  run.roundResults.push(roundResult);
  run.totalKills += br.enemyKills;
  run.pendingBonusCredits = input.roundType === 'bonus' ? input.bonusReward.bonusCredits : 0;
  return roundResult;
}

function isRunOver(): boolean {
  return run.lives <= 0;
}

function isRunCleared(): boolean {
  return run.wins >= RUN_WIN_TARGET;
}

function buildRunResult(): RunResult {
  return {
    cleared: isRunCleared(),
    rounds: run.round - 1,
    wins: run.wins,
    losses: RUN_MAX_LIVES - run.lives,
    totalKills: run.totalKills,
    roundResults: [...run.roundResults],
  };
}

/** ラウンド結果を処理し、ラン継続/終了を判定して返す */
export function processRoundEnd(input: RoundEndInput): RoundOutcome {
  const roundResult = recordRoundResult(input);
  run.round += 1;

  if (isRunOver() || isRunCleared()) {
    const runResult = buildRunResult();
    endRun();
    return { type: 'runComplete', runResult };
  }

  const status: RunStatus = {
    round: run.round,
    lives: run.lives,
    wins: run.wins,
    winTarget: RUN_WIN_TARGET,
    roundType: scheduleRound(run.round).roundType,
    pendingBonusCredits: run.pendingBonusCredits,
  };
  return { type: 'roundComplete', roundResult, status };
}

export function _resetRunState() {
  clearRunFields(false, 0, 0);
}
