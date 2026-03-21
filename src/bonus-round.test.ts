import { describe, expect, it } from 'vitest';
import { computeBonusCredits } from './bonus-round.ts';

const TOTAL_HP = 10500; // 小200×30 + 大1500×3 (bonusIndex=0)

describe('computeBonusCredits', () => {
  it('0ダメージ → 0', () => {
    expect(computeBonusCredits(0, TOTAL_HP)).toBe(0);
  });

  it('負数ダメージ → 0', () => {
    expect(computeBonusCredits(-1, TOTAL_HP)).toBe(0);
  });

  it('10%撃破 → floor(sqrt(0.1)*8) = 2', () => {
    expect(computeBonusCredits(TOTAL_HP * 0.1, TOTAL_HP)).toBe(2);
  });

  it('25%撃破 → floor(sqrt(0.25)*8) = 4', () => {
    expect(computeBonusCredits(TOTAL_HP * 0.25, TOTAL_HP)).toBe(4);
  });

  it('50%撃破 → floor(sqrt(0.5)*8) = 5', () => {
    expect(computeBonusCredits(TOTAL_HP * 0.5, TOTAL_HP)).toBe(5);
  });

  it('75%撃破 → floor(sqrt(0.75)*8) = 6', () => {
    expect(computeBonusCredits(TOTAL_HP * 0.75, TOTAL_HP)).toBe(6);
  });

  it('全撃破 → 8', () => {
    expect(computeBonusCredits(TOTAL_HP, TOTAL_HP)).toBe(8);
  });

  it('MAX を超過しない', () => {
    expect(computeBonusCredits(TOTAL_HP, TOTAL_HP)).toBeLessThanOrEqual(8);
    expect(computeBonusCredits(50000, TOTAL_HP)).toBeLessThanOrEqual(8);
  });

  it('報酬は撃破HPの増加に対して単調非減少', () => {
    let prev = 0;
    for (let hp = 0; hp <= TOTAL_HP; hp += 100) {
      const credits = computeBonusCredits(hp, TOTAL_HP);
      expect(credits).toBeGreaterThanOrEqual(prev);
      prev = credits;
    }
  });
});
