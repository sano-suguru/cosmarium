import type { MeleeResult } from '../melee-tracker.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import { MAX_TEAMS } from '../team.ts';
import type { BattleResult, FleetSetup } from '../types-fleet.ts';

/** FFA 用の敵艦隊を生成して返す。チーム数は 3-5 でランダムに変動 */
export function generateFfaEnemySetups(rng: () => number, round: number): { setups: FleetSetup[]; teamCount: number } {
  const teamCount = 3 + Math.floor(rng() * 3);
  if (teamCount > MAX_TEAMS) {
    throw new Error(`FFA teamCount ${teamCount} exceeds MAX_TEAMS`);
  }
  const enemyCount = teamCount - 1;
  const setups = Array.from({ length: enemyCount }, () => generateEnemySetup(rng, round).setup);
  return { setups, teamCount };
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
