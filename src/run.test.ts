import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleRound } from './round-schedule.ts';
import {
  _resetRunState,
  endRun,
  getRunInfo,
  getRunMothershipType,
  isRunActive,
  lockMothership,
  processRoundEnd,
  RUN_MAX_LIVES,
  RUN_WIN_TARGET,
  resetRun,
} from './run.ts';
import { NO_TYPE } from './types.ts';
import type { BattleResult, BonusReward, RoundEndInput } from './types-fleet.ts';
import { HIVE_TYPE } from './unit-type-accessors.ts';

function makeBattleResult(overrides: Partial<BattleResult> = {}): BattleResult {
  return {
    victory: true,
    elapsed: 30,
    playerSurvivors: 10,
    enemyKills: 5,
    ...overrides,
  };
}

const DUMMY_BONUS: BonusReward = { bonusCredits: 10, bonusPct: 50 };

/** ラウンド番号から RoundEndInput を構築。ボーナスラウンドは自動判定 */
function makeInput(round: number, overrides: Partial<BattleResult> = {}): RoundEndInput {
  const rt = scheduleRound(round).roundType;
  const br = makeBattleResult(overrides);
  if (rt === 'bonus') {
    return { roundType: 'bonus', battleResult: br, bonusReward: DUMMY_BONUS };
  }
  return { roundType: rt, battleResult: br };
}

/** victory を指定して現ラウンドの RoundEndInput を構築（getRunInfo から round 取得） */
function inputForCurrent(victory: boolean, overrides: Partial<BattleResult> = {}): RoundEndInput {
  const info = getRunInfo();
  if (!info) {
    throw new Error('inputForCurrent: run is not active');
  }
  return makeInput(info.round, { victory, ...overrides });
}

/** ランが終了するまでラウンドを進める。各ラウンドの勝敗は victory で指定 */
function advanceUntilEnd(
  victory: boolean,
  overrides: Partial<BattleResult> = {},
): Extract<ReturnType<typeof processRoundEnd>, { type: 'runComplete' }> {
  const MAX_ITERATIONS = RUN_WIN_TARGET + RUN_MAX_LIVES + 50;
  let outcome: ReturnType<typeof processRoundEnd>;
  let iterations = 0;
  do {
    if (++iterations > MAX_ITERATIONS) {
      throw new Error(`advanceUntilEnd: exceeded ${MAX_ITERATIONS} iterations`);
    }
    outcome = processRoundEnd(inputForCurrent(victory, overrides));
  } while (outcome.type !== 'runComplete');
  return outcome as Extract<typeof outcome, { type: 'runComplete' }>;
}

describe('run', () => {
  afterEach(() => {
    _resetRunState();
    vi.restoreAllMocks();
  });

  it('resetRun initializes run state', () => {
    resetRun();
    expect(isRunActive()).toBe(true);
    const info = getRunInfo();
    expect(info).not.toBeNull();
    expect(info?.round).toBe(1);
    expect(info?.lives).toBe(RUN_MAX_LIVES);
    expect(info?.wins).toBe(0);
    expect(info?.winTarget).toBe(RUN_WIN_TARGET);
    expect(info?.roundType).toBe('battle');
  });

  it('getRunInfo returns null when run is inactive', () => {
    expect(getRunInfo()).toBeNull();
  });

  it('endRun fully resets run state', () => {
    resetRun();
    processRoundEnd(makeInput(1, { victory: true }));
    expect(isRunActive()).toBe(true);

    endRun();
    expect(isRunActive()).toBe(false);
    expect(getRunInfo()).toBeNull();
  });

  describe('processRoundEnd', () => {
    it('returns roundComplete on victory with next-round status', () => {
      resetRun();
      const outcome = processRoundEnd(makeInput(1, { victory: true }));
      expect(outcome.type).toBe('roundComplete');
      if (outcome.type === 'roundComplete') {
        expect(outcome.roundResult.round).toBe(1);
        expect(outcome.roundResult.roundType).toBe('battle');
        if (outcome.roundResult.roundType !== 'bonus') {
          expect(outcome.roundResult.victory).toBe(true);
        }
        expect(outcome.status.round).toBe(2);
        expect(outcome.status.roundType).toBe('battle');
        expect(outcome.status.wins).toBe(1);
        expect(outcome.status.lives).toBe(RUN_MAX_LIVES);
      }
      expect(getRunInfo()?.round).toBe(2);
    });

    it('returns roundComplete on defeat with decremented lives', () => {
      resetRun();
      const outcome = processRoundEnd(makeInput(1, { victory: false }));
      expect(outcome.type).toBe('roundComplete');
      if (outcome.type === 'roundComplete') {
        expect(outcome.status.lives).toBe(RUN_MAX_LIVES - 1);
        expect(outcome.status.wins).toBe(0);
      }
    });

    it('returns runComplete when lives reach 0', () => {
      resetRun();
      const outcome = advanceUntilEnd(false);
      expect(outcome.runResult.cleared).toBe(false);
      expect(outcome.runResult.losses).toBe(RUN_MAX_LIVES);
      expect(isRunActive()).toBe(false);
    });

    it('returns runComplete when wins reach target', () => {
      resetRun();
      const outcome = advanceUntilEnd(true);
      expect(outcome.runResult.cleared).toBe(true);
      expect(outcome.runResult.wins).toBe(RUN_WIN_TARGET);
      expect(isRunActive()).toBe(false);
    });

    it('accumulates stats across rounds', () => {
      resetRun();
      processRoundEnd(makeInput(1, { victory: true, enemyKills: 5 }));
      processRoundEnd(makeInput(2, { victory: false, enemyKills: 3 }));
      processRoundEnd(makeInput(3, { victory: true, enemyKills: 7 }));

      const info = getRunInfo();
      expect(info?.round).toBe(4);
      expect(info?.wins).toBe(1); // only R1 counts as win; R3 is bonus
      expect(info?.lives).toBe(RUN_MAX_LIVES - 1); // only R2 loss counts
    });

    it('round number in roundResult reflects completed round', () => {
      resetRun();
      const r1 = processRoundEnd(makeInput(1));
      if (r1.type === 'roundComplete') {
        expect(r1.roundResult.round).toBe(1);
      }
      const r2 = processRoundEnd(makeInput(2));
      if (r2.type === 'roundComplete') {
        expect(r2.roundResult.round).toBe(2);
      }
    });

    it('status.roundType reflects ffa for round 5', () => {
      resetRun();
      processRoundEnd(makeInput(1, { victory: true }));
      processRoundEnd(makeInput(2, { victory: true }));
      processRoundEnd(makeInput(3, { victory: true }));
      const r4 = processRoundEnd(makeInput(4, { victory: true }));
      expect(r4.type).toBe('roundComplete');
      if (r4.type !== 'roundComplete') {
        return;
      }
      expect(r4.roundResult.round).toBe(4);
      expect(r4.roundResult.roundType).toBe('battle');
      expect(r4.status.round).toBe(5);
      expect(r4.status.roundType).toBe('ffa');
    });

    it('bonus round does not decrement lives on defeat', () => {
      resetRun();
      processRoundEnd(makeInput(1, { victory: true }));
      processRoundEnd(makeInput(2, { victory: true }));
      // Round 3 is bonus — defeat should not cost a life
      const r3 = processRoundEnd(makeInput(3, { victory: false }));
      if (r3.type === 'roundComplete') {
        expect(r3.roundResult.roundType).toBe('bonus');
        expect(r3.status.lives).toBe(RUN_MAX_LIVES);
        expect(r3.status.wins).toBe(2); // only 2 wins from rounds 1-2
      }
    });

    it('runResult.losses counts only combat defeats (bonus rounds excluded)', () => {
      resetRun();
      processRoundEnd(makeInput(1, { victory: true, enemyKills: 3 }));
      processRoundEnd(makeInput(2, { victory: false, enemyKills: 1 }));
      processRoundEnd(makeInput(3, { victory: false, enemyKills: 2 })); // bonus — defeat ignored
      processRoundEnd(makeInput(4, { victory: false, enemyKills: 1 }));

      const info = getRunInfo();
      expect(info).not.toBeNull();
      expect(info?.wins).toBe(1);
      // lives decreased only by R2 and R4 (bonus R3 is excluded)
      expect(info?.lives).toBe(RUN_MAX_LIVES - 2);
      expect(info?.round).toBe(5);

      // Run until end with losses to verify final runResult.losses
      const outcome = advanceUntilEnd(false, { enemyKills: 0 });
      // losses = RUN_MAX_LIVES - remaining lives. Bonus rounds never reduce lives.
      expect(outcome.runResult.losses).toBe(RUN_MAX_LIVES);
      // rounds includes all rounds (bonus included)
      expect(outcome.runResult.roundResults.length).toBeGreaterThan(RUN_MAX_LIVES);
      // Verify bonus rounds are in roundResults
      const bonusResults = outcome.runResult.roundResults.filter((r) => r.roundType === 'bonus');
      expect(bonusResults.length).toBeGreaterThanOrEqual(1);
    });

    it('runResult includes all round results', () => {
      resetRun();
      processRoundEnd(makeInput(1, { victory: true, enemyKills: 5 }));
      // Lose from R2 onward until run ends
      const lastOutcome = advanceUntilEnd(false, { enemyKills: 1 });
      expect(lastOutcome.runResult.cleared).toBe(false);
      expect(lastOutcome.runResult.wins).toBe(1);
      expect(lastOutcome.runResult.roundResults.length).toBeGreaterThanOrEqual(RUN_MAX_LIVES + 1);
    });
  });

  describe('lockMothership / getRunMothershipType', () => {
    it('ラン中に1回だけロック可能', () => {
      resetRun();
      lockMothership(HIVE_TYPE);
      expect(getRunMothershipType()).toBe(HIVE_TYPE);
    });

    it('NO_TYPE でのロックは throw', () => {
      resetRun();
      expect(() => lockMothership(NO_TYPE)).toThrow('NO_TYPE');
    });

    it('2回目のロックは throw', () => {
      resetRun();
      lockMothership(HIVE_TYPE);
      expect(() => lockMothership(HIVE_TYPE)).toThrow('already locked');
    });

    it('ラン非アクティブ時のロックは throw', () => {
      expect(() => lockMothership(HIVE_TYPE)).toThrow('without active run');
    });

    it('未ロック時の getRunMothershipType は throw', () => {
      resetRun();
      expect(() => getRunMothershipType()).toThrow('not yet locked');
    });

    it('ラン非アクティブ時の getRunMothershipType は throw', () => {
      expect(() => getRunMothershipType()).toThrow('without active run');
    });

    it('endRun 後にリセットされる', () => {
      resetRun();
      lockMothership(HIVE_TYPE);
      endRun();
      expect(isRunActive()).toBe(false);
    });

    it('resetRun で再ロック可能になる', () => {
      resetRun();
      lockMothership(HIVE_TYPE);
      endRun();
      resetRun();
      expect(() => getRunMothershipType()).toThrow('not yet locked');
      lockMothership(HIVE_TYPE);
      expect(getRunMothershipType()).toBe(HIVE_TYPE);
    });
  });
});
