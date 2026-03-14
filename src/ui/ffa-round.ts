import type { MeleeResult } from '../melee-tracker.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import type { BattleResult, FleetSetup } from '../types-fleet.ts';

export const FFA_TEAM_COUNT = 4;
const FFA_ENEMY_COUNT = FFA_TEAM_COUNT - 1;

/** FFA 用の敵艦隊を生成して返す（純粋関数） */
export function generateFfaEnemySetups(rng: () => number, round: number): FleetSetup[] {
  return Array.from({ length: FFA_ENEMY_COUNT }, () => generateEnemySetup(rng, round).setup);
}

/** FFA (melee) の結果をラン追跡用の BattleResult に変換する。team 0 = プレイヤー前提 */
export function meleeResultToBattleResult(result: MeleeResult): BattleResult {
  const playerStats = result.teamStats[0];
  if (!playerStats) {
    throw new Error('missing player team stats in FFA result');
  }
  return {
    victory: result.winnerTeam === 0,
    elapsed: result.elapsed,
    playerSurvivors: playerStats.survivors,
    enemyKills: playerStats.kills,
  };
}
