import type { BattleTeam, Team } from './types.ts';

export type { BattleTeam, Team };

/** チーム上限。Team / TeamCounts の基数を決定する（変更時は Team 定義も更新すること） */
export const MAX_TEAMS = 5;

/** 全チームを列挙する定数配列。`for (const t of TEAMS)` でキャスト不要なループが可能 */
export const TEAMS: readonly Team[] = [0, 1, 2, 3, 4];

export function teamAt(index: number): Team {
  const team = TEAMS[index];
  if (team === undefined) {
    throw new Error(`Invalid team index: ${index}`);
  }
  return team;
}

/** アクティブなチーム数分だけ Team を yield する。break 忘れリスクを排除 */
export function* teamsOf(n: number): Generator<Team> {
  for (const t of TEAMS) {
    if (t >= n) {
      return;
    }
    yield t;
  }
}

export const TEAM0: Team = 0;
export const TEAM1: Team = 1;
export const TEAM2: Team = 2;
export const TEAM3: Team = 3;
export const TEAM4: Team = 4;

/** MAX_TEAMS 長の数値タプル（自動導出） */
type _Repeat<N extends number, T, Acc extends T[] = []> = Acc['length'] extends N ? Acc : _Repeat<N, T, [...Acc, T]>;
export type TeamTuple<T> = _Repeat<typeof MAX_TEAMS, T>;
export type TeamCounts = TeamTuple<number>;

/** TeamCounts の浅いコピーを型安全に生成する */
export function copyTeamCounts(src: Readonly<TeamCounts>): TeamCounts {
  return src.slice() as unknown as TeamCounts;
}

/** TeamTuple<T> を型安全に map する。Array.map() は U[] を返すため固定長タプル型へのキャストが必要（copyTeamCounts と同パターン） */
export function mapTeamTuple<T, U>(src: Readonly<TeamTuple<T>>, fn: (v: T) => U): TeamTuple<U> {
  return (src as readonly T[]).map(fn) as unknown as TeamTuple<U>;
}
