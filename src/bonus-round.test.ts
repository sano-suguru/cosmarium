import { describe, expect, it } from 'vitest';
import { computeBonusCredits } from './bonus-round.ts';

const TOTAL_HP = 11000; // 小200×25 + 大1500×4

describe('computeBonusCredits', () => {
  it('0ダメージ → 0', () => {
    expect(computeBonusCredits(0, TOTAL_HP)).toBe(0);
  });

  it('負数ダメージ → 0', () => {
    expect(computeBonusCredits(-1, TOTAL_HP)).toBe(0);
  });

  it('部分撃破 → 完了度に比例した報酬', () => {
    // 2750/11000 = 0.25 → floor(0.25 * 6) = 1
    expect(computeBonusCredits(2750, TOTAL_HP)).toBe(1);
  });

  it('全撃破(11000) → base + sweep', () => {
    // ratio=1 → floor(1 * 6)=6, sweep=2, total=8
    expect(computeBonusCredits(TOTAL_HP, TOTAL_HP)).toBe(8);
  });

  it('MAX を超過しない', () => {
    expect(computeBonusCredits(TOTAL_HP, TOTAL_HP)).toBeLessThanOrEqual(8);
    expect(computeBonusCredits(50000, TOTAL_HP)).toBeLessThanOrEqual(8);
  });

  it('小1体分(200) → floor(200/11000 * 6) = 0', () => {
    expect(computeBonusCredits(200, TOTAL_HP)).toBe(0);
  });

  it('小10体分(2000) → floor(2000/11000 * 6) = 1', () => {
    expect(computeBonusCredits(2000, TOTAL_HP)).toBe(1);
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
