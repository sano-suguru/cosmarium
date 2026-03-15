import { mothershipIdx } from '../pools.ts';
import type { Team } from '../team.ts';
import { TEAM0, TEAM1, teamAt } from '../team.ts';
import { NO_UNIT } from '../types.ts';

/** BATTLE 勝敗判定: 母艦撃沈で決着。先に team 0 を判定するため相互撃沈は DEFEAT 扱い */
export function checkBattleWin(): Team | null {
  if (mothershipIdx[0] === NO_UNIT) {
    return TEAM1;
  }
  if (mothershipIdx[1] === NO_UNIT) {
    return TEAM0;
  }
  return null;
}

/**
 * MELEE 勝敗判定: 母艦残存1勢力で勝利、全滅で draw、2勢力以上生存で null（継続）。
 * 残存ユニットは ending フェーズ中に演出として戦闘を継続する（一括除去しない）
 */
export function checkMeleeWin(activeTeamCount: number): Team | 'draw' | null {
  let alive = 0;
  let last: Team = TEAM0;
  for (let i = 0; i < activeTeamCount; i++) {
    const t = teamAt(i);
    if (mothershipIdx[t] !== NO_UNIT) {
      alive++;
      last = t;
    }
  }
  if (alive === 0) {
    return 'draw';
  }
  if (alive === 1) {
    return last;
  }
  return null;
}
