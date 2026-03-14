import { describe, expect, it } from 'vitest';

import type { MeleeResult } from '../melee-tracker.ts';
import type { Team } from '../team.ts';
import { meleeResultToBattleResult } from './ffa-round.ts';

function makeMeleeResult(overrides: Partial<MeleeResult> = {}): MeleeResult {
  return {
    winnerTeam: 0 as Team,
    numTeams: 4,
    elapsed: 60,
    teamStats: [
      { kills: 15, survivors: 8, initialUnits: 20 },
      { kills: 10, survivors: 0, initialUnits: 20 },
      { kills: 5, survivors: 0, initialUnits: 20 },
      { kills: 3, survivors: 0, initialUnits: 20 },
    ],
    eliminations: [],
    ...overrides,
  };
}

describe('meleeResultToBattleResult', () => {
  it('converts player victory', () => {
    const result = meleeResultToBattleResult(makeMeleeResult());
    expect(result.victory).toBe(true);
    expect(result.elapsed).toBe(60);
    expect(result.playerSurvivors).toBe(8);
    expect(result.enemyKills).toBe(15);
  });

  it('converts player defeat', () => {
    const result = meleeResultToBattleResult(makeMeleeResult({ winnerTeam: 1 as Team }));
    expect(result.victory).toBe(false);
  });

  it('treats draw as defeat', () => {
    const result = meleeResultToBattleResult(makeMeleeResult({ winnerTeam: null }));
    expect(result.victory).toBe(false);
  });

  it('throws when player stats missing', () => {
    expect(() => meleeResultToBattleResult(makeMeleeResult({ teamStats: [] }))).toThrow(
      'missing player team stats in FFA result',
    );
  });
});
