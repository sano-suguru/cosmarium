import { describe, expect, it } from 'vitest';

import { scheduleRound } from './round-schedule.ts';

describe('scheduleRound', () => {
  it('returns battle for rounds 1-2', () => {
    for (let r = 1; r <= 2; r++) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
    }
  });

  it('returns bonus with preview for round 3 (5n+3 pattern)', () => {
    for (const r of [3, 8, 13, 18]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('bonus');
      expect(entry.preview).toBe(true);
    }
  });

  it('returns ffa with preview for multiples of 5', () => {
    for (const r of [5, 10, 15, 20]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('ffa');
      expect(entry.preview).toBe(true);
    }
  });

  it('throws on round < 1', () => {
    expect(() => scheduleRound(0)).toThrow('invalid round');
    expect(() => scheduleRound(-1)).toThrow('invalid round');
  });

  it('returns battle for non-special rounds after round 2', () => {
    for (const r of [4, 6, 7, 9, 11, 12, 14]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
    }
  });
});
