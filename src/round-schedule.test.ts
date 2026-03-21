import { describe, expect, it } from 'vitest';

import { BONUS_OFFSET, BOSS_MAX_MUL, BOSS_PERIOD, bossBudgetMul, FFA_PERIOD, scheduleRound } from './round-schedule.ts';

describe('scheduleRound', () => {
  it('returns battle for rounds 1-2', () => {
    for (let r = 1; r <= 2; r++) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
    }
  });

  it('returns bonus with preview and bonusIndex for round 3 (FFA_PERIOD*n+BONUS_OFFSET pattern)', () => {
    const rounds = [
      BONUS_OFFSET,
      FFA_PERIOD + BONUS_OFFSET,
      FFA_PERIOD * 2 + BONUS_OFFSET,
      FFA_PERIOD * 3 + BONUS_OFFSET,
    ];
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i] as number;
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('bonus');
      expect(entry.preview).toBe(true);
      if (entry.roundType === 'bonus') {
        expect(entry.bonusIndex).toBe(i);
      }
    }
  });

  it('returns boss with preview for multiples of BOSS_PERIOD', () => {
    for (const r of [BOSS_PERIOD, BOSS_PERIOD * 2]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('boss');
      expect(entry.preview).toBe(true);
    }
  });

  it('boss takes priority over ffa when round is multiple of both BOSS_PERIOD and FFA_PERIOD', () => {
    const entry = scheduleRound(BOSS_PERIOD * FFA_PERIOD);
    expect(entry.roundType).toBe('boss');
  });

  it('returns ffa with preview for multiples of FFA_PERIOD (non-boss)', () => {
    for (const r of [FFA_PERIOD, FFA_PERIOD * 2, FFA_PERIOD * 3, FFA_PERIOD * 4]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('ffa');
      expect(entry.preview).toBe(true);
    }
  });

  it('throws on round < 1', () => {
    expect(() => scheduleRound(0)).toThrow('invalid round');
    expect(() => scheduleRound(-1)).toThrow('invalid round');
  });

  it('boss takes priority over bonus when round matches both', () => {
    // r=63: 63%7===0 (boss) かつ 63%5===3 (bonus) → boss が勝つ
    const r = 63;
    expect(r % BOSS_PERIOD).toBe(0);
    expect(r % FFA_PERIOD).toBe(BONUS_OFFSET);
    expect(scheduleRound(r).roundType).toBe('boss');
  });

  it('returns battle for non-special rounds after round 2', () => {
    for (const r of [4, 6, 9, 11, 12, 16]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
    }
  });

  it('bonusIndex は0始まりで単調増加', () => {
    let prevIdx = -1;
    let count = 0;
    for (let r = 1; r <= 50; r++) {
      const entry = scheduleRound(r);
      if (entry.roundType === 'bonus') {
        if (count === 0) {
          expect(entry.bonusIndex).toBe(0);
        }
        expect(entry.bonusIndex).toBeGreaterThan(prevIdx);
        prevIdx = entry.bonusIndex;
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe('bossBudgetMul', () => {
  it('returns base multiplier for early rounds', () => {
    expect(bossBudgetMul(7)).toBe(1.5);
  });

  it('escalates at BOSS_PERIOD * 2 intervals', () => {
    expect(bossBudgetMul(14)).toBe(2.0);
  });

  it('escalates further at BOSS_PERIOD * 4', () => {
    expect(bossBudgetMul(28)).toBe(2.5);
  });

  it('throws on non-boss round', () => {
    expect(() => bossBudgetMul(1)).toThrow('not a boss round');
    expect(() => bossBudgetMul(6)).toThrow('not a boss round');
    expect(() => bossBudgetMul(8)).toThrow('not a boss round');
  });

  it('高ラウンドで BOSS_MAX_MUL にクランプされる', () => {
    // round=700 → floor(700 / 14) * 0.5 + 1.5 = 26.5 → clamped to 5.0
    expect(bossBudgetMul(700)).toBe(BOSS_MAX_MUL);
  });

  it('クランプ到達前は線形増加', () => {
    const r1 = bossBudgetMul(7); // 1.5
    const r2 = bossBudgetMul(14); // 2.0
    const r3 = bossBudgetMul(28); // 2.5
    expect(r1).toBe(1.5);
    expect(r2).toBe(2.0);
    expect(r3).toBe(2.5);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r3).toBeLessThan(BOSS_MAX_MUL);
  });
});
