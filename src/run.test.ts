import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRunState,
  endRun,
  getRunInfo,
  isRunActive,
  processRoundEnd,
  RUN_MAX_LIVES,
  RUN_WIN_TARGET,
  resetRun,
} from './run.ts';
import type { BattleResult } from './types-fleet.ts';

function makeBattleResult(overrides: Partial<BattleResult> = {}): BattleResult {
  return {
    victory: true,
    elapsed: 30,
    playerSurvivors: 10,
    enemyKills: 5,
    ...overrides,
  };
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
  });

  it('getRunInfo returns null when run is inactive', () => {
    expect(getRunInfo()).toBeNull();
  });

  it('endRun fully resets run state', () => {
    resetRun();
    processRoundEnd(makeBattleResult({ victory: true }));
    expect(isRunActive()).toBe(true);

    endRun();
    expect(isRunActive()).toBe(false);
    expect(getRunInfo()).toBeNull();
  });

  describe('processRoundEnd', () => {
    it('returns roundComplete on victory', () => {
      resetRun();
      const outcome = processRoundEnd(makeBattleResult({ victory: true }));
      expect(outcome.type).toBe('roundComplete');
      if (outcome.type === 'roundComplete') {
        expect(outcome.roundResult.round).toBe(1);
        expect(outcome.roundResult.victory).toBe(true);
        expect(outcome.status.wins).toBe(1);
        expect(outcome.status.lives).toBe(RUN_MAX_LIVES);
      }
      expect(getRunInfo()?.round).toBe(2);
    });

    it('returns roundComplete on defeat with decremented lives', () => {
      resetRun();
      const outcome = processRoundEnd(makeBattleResult({ victory: false }));
      expect(outcome.type).toBe('roundComplete');
      if (outcome.type === 'roundComplete') {
        expect(outcome.status.lives).toBe(RUN_MAX_LIVES - 1);
        expect(outcome.status.wins).toBe(0);
      }
    });

    it('returns runComplete when lives reach 0', () => {
      resetRun();
      for (let i = 0; i < RUN_MAX_LIVES - 1; i++) {
        const mid = processRoundEnd(makeBattleResult({ victory: false }));
        expect(mid.type).toBe('roundComplete');
      }
      const final = processRoundEnd(makeBattleResult({ victory: false }));
      expect(final.type).toBe('runComplete');
      if (final.type === 'runComplete') {
        expect(final.runResult.cleared).toBe(false);
        expect(final.runResult.losses).toBe(RUN_MAX_LIVES);
      }
      expect(isRunActive()).toBe(false);
    });

    it('returns runComplete when wins reach target', () => {
      resetRun();
      for (let i = 0; i < RUN_WIN_TARGET - 1; i++) {
        const mid = processRoundEnd(makeBattleResult({ victory: true }));
        expect(mid.type).toBe('roundComplete');
      }
      const final = processRoundEnd(makeBattleResult({ victory: true }));
      expect(final.type).toBe('runComplete');
      if (final.type === 'runComplete') {
        expect(final.runResult.cleared).toBe(true);
        expect(final.runResult.wins).toBe(RUN_WIN_TARGET);
      }
      expect(isRunActive()).toBe(false);
    });

    it('accumulates stats across rounds', () => {
      resetRun();
      processRoundEnd(makeBattleResult({ victory: true, enemyKills: 5 }));
      processRoundEnd(makeBattleResult({ victory: false, enemyKills: 3 }));
      processRoundEnd(makeBattleResult({ victory: true, enemyKills: 7 }));

      const info = getRunInfo();
      expect(info?.round).toBe(4);
      expect(info?.wins).toBe(2);
      expect(info?.lives).toBe(RUN_MAX_LIVES - 1);
    });

    it('round number in roundResult reflects completed round', () => {
      resetRun();
      const r1 = processRoundEnd(makeBattleResult());
      if (r1.type === 'roundComplete') {
        expect(r1.roundResult.round).toBe(1);
      }
      const r2 = processRoundEnd(makeBattleResult());
      if (r2.type === 'roundComplete') {
        expect(r2.roundResult.round).toBe(2);
      }
    });

    it('runResult includes all round results', () => {
      resetRun();
      // Win enough to clear
      for (let i = 0; i < RUN_WIN_TARGET; i++) {
        processRoundEnd(makeBattleResult({ victory: true, enemyKills: 2 }));
      }
      // Last call returned runComplete — let's test from scratch with known final
      _resetRunState();
      resetRun();
      processRoundEnd(makeBattleResult({ victory: true, enemyKills: 5 }));
      processRoundEnd(makeBattleResult({ victory: false, enemyKills: 3 }));
      // Lose remaining lives to trigger runComplete
      for (let i = 0; i < RUN_MAX_LIVES - 1; i++) {
        processRoundEnd(makeBattleResult({ victory: false, enemyKills: 1 }));
      }
      // The last processRoundEnd returned runComplete — need to capture it
      _resetRunState();
      resetRun();
      processRoundEnd(makeBattleResult({ victory: true, enemyKills: 5 }));
      let lastOutcome = processRoundEnd(makeBattleResult({ victory: false, enemyKills: 3 }));
      for (let i = 0; i < RUN_MAX_LIVES - 2; i++) {
        lastOutcome = processRoundEnd(makeBattleResult({ victory: false, enemyKills: 1 }));
      }
      // Final defeat
      lastOutcome = processRoundEnd(makeBattleResult({ victory: false, enemyKills: 1 }));
      expect(lastOutcome.type).toBe('runComplete');
      if (lastOutcome.type === 'runComplete') {
        expect(lastOutcome.runResult.rounds).toBe(RUN_MAX_LIVES + 1);
        expect(lastOutcome.runResult.wins).toBe(1);
        expect(lastOutcome.runResult.totalKills).toBe(5 + 3 + (RUN_MAX_LIVES - 1));
        expect(lastOutcome.runResult.roundResults).toHaveLength(RUN_MAX_LIVES + 1);
      }
    });
  });
});
