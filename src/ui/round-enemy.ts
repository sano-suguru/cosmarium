import { scheduleRound } from '../round-schedule.ts';
import { generateBossSetup, generateEnemySetup } from '../simulation/enemy-fleet.ts';
import type { BattleRoundType, FleetSetup } from '../types-fleet.ts';
import { generateFfaEnemySetups } from './ffa-round.ts';

type RoundEnemyState =
  | { readonly roundType: BattleRoundType; readonly enemySetup: FleetSetup; readonly archName: string }
  | { readonly roundType: 'ffa'; readonly setups: FleetSetup[]; readonly teamCount: number; readonly archName: string }
  | { readonly roundType: 'bonus'; readonly archName: string };

export function prepareRoundEnemy(round: number, rng: () => number): RoundEnemyState {
  const schedule = scheduleRound(round);
  switch (schedule.roundType) {
    case 'boss': {
      const { setup, archetypeName } = generateBossSetup(rng, round);
      return { roundType: 'boss', enemySetup: setup, archName: archetypeName };
    }
    case 'ffa': {
      const ffaResult = generateFfaEnemySetups(rng, round);
      return {
        roundType: 'ffa',
        archName: `FFA ${ffaResult.teamCount}勢力`,
        setups: ffaResult.setups,
        teamCount: ffaResult.teamCount,
      };
    }
    case 'bonus':
      return { roundType: 'bonus', archName: 'ボーナス: 資源小惑星帯' };
    case 'battle':
    case 'pve': {
      const { setup, archetypeName } = generateEnemySetup(rng, round);
      return { roundType: schedule.roundType, enemySetup: setup, archName: archetypeName };
    }
    default: {
      const _: never = schedule;
      throw new Error(`Unknown roundType: ${(_ as { roundType: string }).roundType}`);
    }
  }
}
