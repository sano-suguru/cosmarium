import type { BattleResult, RoundResult, RunResult, RunStatus } from './types.ts';

export const RUN_MAX_LIVES = 5;
export const RUN_WIN_TARGET = 10;

/** processRoundEnd の返値型 */
type RoundOutcome =
  | { readonly type: 'roundComplete'; readonly roundResult: RoundResult; readonly status: RunStatus }
  | { readonly type: 'runComplete'; readonly runResult: RunResult };

type RunState = {
  active: boolean;
  round: number;
  lives: number;
  wins: number;
  totalKills: number;
  roundResults: RoundResult[];
};

const run: RunState = {
  active: false,
  round: 0,
  lives: 0,
  wins: 0,
  totalKills: 0,
  roundResults: [],
};

function clearRunFields(active: boolean, round: number, lives: number) {
  run.active = active;
  run.round = round;
  run.lives = lives;
  run.wins = 0;
  run.totalKills = 0;
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

export function getRunInfo(): RunStatus | null {
  if (!run.active) {
    return null;
  }
  return { round: run.round, lives: run.lives, wins: run.wins, winTarget: RUN_WIN_TARGET };
}

function recordRoundResult(battleResult: BattleResult): RoundResult {
  const roundResult: RoundResult = { ...battleResult, round: run.round };

  run.roundResults.push(roundResult);
  run.totalKills += battleResult.enemyKills;

  if (battleResult.victory) {
    run.wins += 1;
  } else {
    run.lives -= 1;
  }

  run.round += 1;
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
    losses: run.round - 1 - run.wins,
    totalKills: run.totalKills,
    roundResults: [...run.roundResults],
  };
}

/** ラウンド結果を処理し、ラン継続/終了を判定して返す */
export function processRoundEnd(battleResult: BattleResult): RoundOutcome {
  const roundResult = recordRoundResult(battleResult);

  if (isRunOver() || isRunCleared()) {
    const runResult = buildRunResult();
    endRun();
    return { type: 'runComplete', runResult };
  }

  const status: RunStatus = {
    round: roundResult.round,
    lives: run.lives,
    wins: run.wins,
    winTarget: RUN_WIN_TARGET,
  };
  return { type: 'roundComplete', roundResult, status };
}

/** テスト専用: ラン状態をリセット */
export function _resetRunState() {
  clearRunFields(false, 0, 0);
}
