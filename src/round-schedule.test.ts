import { describe, expect, it } from 'vitest';

import { scheduleRound } from './round-schedule.ts';

describe('scheduleRound', () => {
  it('returns battle for rounds 1-4', () => {
    for (let r = 1; r <= 4; r++) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
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

  it('returns battle for non-multiples of 5 after round 4', () => {
    for (const r of [6, 7, 8, 9, 11, 12]) {
      const entry = scheduleRound(r);
      expect(entry.roundType).toBe('battle');
      expect(entry.preview).toBe(false);
    }
  });
});
