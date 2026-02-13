import { describe, expect, it } from 'vitest';
import { enemyTeam } from './types.ts';

describe('enemyTeam', () => {
  it('returns 1 for team 0', () => {
    expect(enemyTeam(0)).toBe(1);
  });

  it('returns 0 for team 1', () => {
    expect(enemyTeam(1)).toBe(0);
  });
});
