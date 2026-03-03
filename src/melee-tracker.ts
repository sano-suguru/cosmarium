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
import { MAX_TEAMS } from './types.ts';

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

// --- データ収集用モジュール変数 ---
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

  // データ収集リセット
  meleeKills.fill(0);
  meleeEliminations.length = 0;
  eliminated.fill(false);

  for (let i = 0; i < MAX_TEAMS; i++) {
    meleeInitialUnits[i as Team] = initialCounts[i as Team];
  }

  // 前回のhookを解除してから新しいhookを登録
  if (unsubKillHook) {
    unsubKillHook();
    unsubKillHook = null;
  }

  unsubKillHook = onKillUnit((e) => {
    // killerTeam のキル数をインクリメント
    if (e.killerTeam !== undefined) {
      meleeKills[e.killerTeam]++;
    }

    // victimTeam の全滅チェック
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

  // teamStats を構築
  const teamStats: TeamStats[] = [];
  for (let i = 0; i < meleeNumTeams; i++) {
    teamStats.push({
      kills: meleeKills[i as Team],
      survivors: teamUnitCounts[i as Team],
      initialUnits: meleeInitialUnits[i as Team],
    });
  }

  const result: MeleeResult = {
    winnerTeam: meleeWinner === 'draw' ? null : meleeWinner,
    numTeams: meleeNumTeams,
    elapsed: meleeElapsed,
    teamStats,
    eliminations: [...meleeEliminations],
  };

  // hook を解除
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
