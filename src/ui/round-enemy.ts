import { scheduleRound } from '../round-schedule.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import type { FleetSetup } from '../types-fleet.ts';
import { generateFfaEnemySetups } from './ffa-round.ts';

type RoundEnemyState =
  | { readonly roundType: 'battle'; readonly enemySetup: FleetSetup; readonly archName: string }
  | { readonly roundType: 'ffa'; readonly setups: FleetSetup[]; readonly teamCount: number; readonly archName: string }
  | { readonly roundType: 'bonus'; readonly archName: string };

export function prepareRoundEnemy(round: number, rng: () => number): RoundEnemyState {
  const schedule = scheduleRound(round);
  if (schedule.roundType === 'ffa') {
    const ffaResult = generateFfaEnemySetups(rng, round);
    return {
      roundType: 'ffa',
      archName: `FFA ${ffaResult.teamCount}勢力`,
      setups: ffaResult.setups,
      teamCount: ffaResult.teamCount,
    };
  }
  if (schedule.roundType === 'bonus') {
    return { roundType: 'bonus', archName: 'ボーナス: 資源小惑星帯' };
  }
  const { setup, archetypeName } = generateEnemySetup(rng, round);
  return { roundType: 'battle', enemySetup: setup, archName: archetypeName };
}
