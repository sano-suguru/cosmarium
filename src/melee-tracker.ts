/**
 * melee-tracker — MELEEモードの経過時間・勝敗・結果を管理するモジュール。
 *
 * battle-tracker と同様の構造だが、N勢力対応かつ増援なしの残存戦用。
 * - `advanceMeleeElapsed(simDt)` で毎 substep の経過時間を加算
 * - `onMeleeEnd(winner)` で勝者を記録し、余韻タイマー開始
 * - `advanceMeleeEndTimer(dt)` で delay 後に finalize コールバックを呼ぶ
 */
import { teamUnitCounts } from './pools.ts';
import { onKillUnit } from './simulation/spawn.ts';
import type { Team, TeamCounts, TeamTuple } from './types.ts';
import { TEAMS, teamsOf } from './types.ts';

export interface EliminationEvent {
  readonly team: Team;
  /** 全滅時の経過時間（秒） */
  readonly elapsed: number;
}

export interface TeamStats {
  readonly kills: number;
  readonly survivors: number;
  readonly initialUnits: number;
}

export interface MeleeResult {
  /** 勝者チーム。draw の場合は null */
  readonly winnerTeam: Team | null;
  readonly numTeams: number;
  readonly elapsed: number;
  readonly teamStats: readonly TeamStats[];
  readonly eliminations: readonly EliminationEvent[];
}

const MELEE_END_DELAY = 2;

type FinalizeCb = (result: MeleeResult) => void;
let onFinalize: FinalizeCb | null = null;

let meleeElapsed = 0;
let meleeEndTimer = -1;
let meleeWinner: Team | 'draw' | undefined;
let meleeNumTeams = 0;

const meleeKills: TeamCounts = [0, 0, 0, 0, 0];
const meleeInitialUnits: TeamCounts = [0, 0, 0, 0, 0];
const meleeEliminations: EliminationEvent[] = [];
const eliminated: TeamTuple<boolean> = [false, false, false, false, false];
let unsubKillHook: (() => void) | null = null;

/**
 * MELEE 終了時のコールバックを登録する。
 * セッションレベルの設定であり、アプリ起動時に1回だけ呼ぶ。
 * {@link resetMeleeTracking} で解除されない（ゲームを跨いで保持される）。
 */

export function setOnMeleeFinalize(cb: FinalizeCb) {
  onFinalize = cb;
}

/**
 * MELEE ゲーム開始ごとにトラッキング状態をリセットする。
 * ゲームレベルの操作であり、毎ゲーム開始時に呼ぶ。
 * kill hook は再登録されるが、{@link setOnMeleeFinalize} で設定した
 * onFinalize コールバックは保持される（セッションレベルのため）。
 */

export function resetMeleeTracking(numTeams: number, initialCounts: Readonly<TeamCounts>) {
  meleeElapsed = 0;
  meleeEndTimer = -1;
  meleeWinner = undefined;
  meleeNumTeams = numTeams;

  meleeKills.fill(0);
  meleeEliminations.length = 0;
  eliminated.fill(false);

  for (const t of TEAMS) {
    meleeInitialUnits[t] = initialCounts[t];
  }

  // 前回のhookを解除してから新しいhookを登録
  if (unsubKillHook) {
    unsubKillHook();
    unsubKillHook = null;
  }

  unsubKillHook = onKillUnit((e) => {
    if (e.killerTeam !== undefined) {
      meleeKills[e.killerTeam]++;
    }

    if (!eliminated[e.victimTeam] && e.victimTeamRemaining === 0) {
      eliminated[e.victimTeam] = true;
      meleeEliminations.push({ team: e.victimTeam, elapsed: meleeElapsed });
    }
  });
}

export function advanceMeleeElapsed(simDt: number) {
  meleeElapsed += simDt;
}

export function onMeleeEnd(winner: Team | 'draw') {
  if (meleeWinner !== undefined) {
    return;
  }
  meleeWinner = winner;
  meleeEndTimer = MELEE_END_DELAY;
}

function finalizeMelee() {
  if (meleeWinner === undefined || onFinalize === null) {
    return;
  }

  const teamStats: TeamStats[] = [];
  for (const t of teamsOf(meleeNumTeams)) {
    teamStats.push({
      kills: meleeKills[t],
      survivors: teamUnitCounts[t],
      initialUnits: meleeInitialUnits[t],
    });
  }

  const result: MeleeResult = {
    winnerTeam: meleeWinner === 'draw' ? null : meleeWinner,
    numTeams: meleeNumTeams,
    elapsed: meleeElapsed,
    teamStats,
    eliminations: [...meleeEliminations],
  };

  if (unsubKillHook) {
    unsubKillHook();
    unsubKillHook = null;
  }

  onFinalize(result);
}

export function advanceMeleeEndTimer(dt: number) {
  if (meleeEndTimer >= 0) {
    meleeEndTimer -= dt;
    if (meleeEndTimer < 0) {
      finalizeMelee();
    }
  }
}

/** テスト専用: 全モジュール変数をリセット */
export function _resetMeleeTracker() {
  meleeElapsed = 0;
  meleeEndTimer = -1;
  meleeWinner = undefined;
  meleeNumTeams = 0;
  onFinalize = null;

  meleeKills.fill(0);
  meleeInitialUnits.fill(0);
  meleeEliminations.length = 0;
  eliminated.fill(false);

  if (unsubKillHook) {
    unsubKillHook();
    unsubKillHook = null;
  }
}
