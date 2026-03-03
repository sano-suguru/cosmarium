/**
 * battle-tracker — バトルモードの経過・勝敗・結果集計を管理するモジュール。
 *
 * 設計意図:
 * - main.ts のフレームループから `advanceBattleTimer(dt)` で毎フレーム呼ばれ、
 *   バトル経過時間の更新と、勝敗検知後の余韻タイマー→ finalize 遷移を担う。
 * - `onBattleEnd()` は drainAccumulator 内で複数 stepOnce が勝者を返しうるため、
 *   最初の1回のみ処理する二重呼び出しガードを持つ。
 * - `advanceBattleTimer(dt)` は呼び出しフィルタリングを含まない。
 *   呼び出し側 (main.ts) が `battlePhase` に基づいて制御する:
 *   - `'battle'`: advanceBattleTimer が呼ばれ、勝敗判定＋結果集計が有効
 *   - `'battleEnding'`: 勝者検知後の余韻。勝敗判定はスキップだが advanceBattleTimer は継続
 *   - `'spectate'`/`'melee'`/`'meleeEnding'`/`'aftermath'`: advanceBattleTimer は呼ばれない
 */
import type { BattleResult, BattleSnapshot, Team } from './types.ts';

/** 全滅検知後の余韻（秒） */
const BATTLE_END_DELAY = 2;

type FinalizeCb = (result: BattleResult) => void;
const throwUnset: FinalizeCb = () => {
  throw new Error('setOnFinalize() must be called before battle can end');
};
let onFinalize: FinalizeCb = throwUnset;

export function setOnFinalize(cb: FinalizeCb) {
  onFinalize = cb;
}

// --- バトル追跡状態 ---

let battleElapsed = 0;
let initialPlayerUnits = 0;
let playerEnemyKills = 0;
let battleEndTimer = -1;
let battleWinner: Team | null = null;
let snapshotSurvivors = 0;
let snapshotEnemyKills = 0;

// --- Public API ---

export function resetBattleTracking() {
  battleElapsed = 0;
  initialPlayerUnits = 0;
  playerEnemyKills = 0;
  battleEndTimer = -1;
  battleWinner = null;
  snapshotSurvivors = 0;
  snapshotEnemyKills = 0;
}

/** テスト専用: 全モジュール変数をリセット（onFinalize 含む） */
export function _resetBattleTracker() {
  resetBattleTracking();
  onFinalize = throwUnset;
}

export function onBattleEnd(winner: Team, snapshot: BattleSnapshot) {
  // drainAccumulator 内で複数 stepOnce が勝者を返しうるが、最初の1回のみ処理
  if (battleWinner !== null) return;
  battleWinner = winner;
  snapshotSurvivors = snapshot.survivors;
  snapshotEnemyKills = snapshot.enemyKills;
  battleEndTimer = BATTLE_END_DELAY;
}

export function getPlayerEnemyKills(): number {
  return playerEnemyKills;
}

function finalizeBattle() {
  if (battleWinner === null) return;
  const victory = battleWinner === 0;
  const result: BattleResult = {
    victory,
    elapsed: battleElapsed,
    playerSurvivors: snapshotSurvivors,
    enemyKills: snapshotEnemyKills,
    playerLosses: initialPlayerUnits - snapshotSurvivors,
    initialPlayerUnits,
  };
  onFinalize(result);
}

export function addEnemyKill() {
  playerEnemyKills++;
}

/** バトル経過をシミュレーション時間で加算（drainAccumulator 内の各 substep から呼ぶ） */
export function advanceBattleElapsed(simDt: number) {
  battleElapsed += simDt;
}

/** 余韻タイマーのカウントダウン（ウォールクロック dt で駆動） */
export function advanceBattleEndTimer(dt: number) {
  if (battleEndTimer >= 0) {
    battleEndTimer -= dt;
    if (battleEndTimer < 0) finalizeBattle();
  }
}

export function setInitialPlayerUnits(n: number) {
  initialPlayerUnits = n;
}
