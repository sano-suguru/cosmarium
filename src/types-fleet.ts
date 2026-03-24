import type { UnitTypeIndex } from './types.ts';

export type FleetEntry = { readonly type: UnitTypeIndex; readonly count: number };
export type FleetComposition = readonly FleetEntry[];

export type BattleSnapshot = {
  readonly survivors: number;
  readonly enemyKills: number;
};

export type BattleResult = {
  readonly victory: boolean;
  readonly elapsed: number;
  readonly playerSurvivors: number;
  readonly enemyKills: number;
};

/** battle-tracker が追跡する 1v1 戦闘系ラウンドタイプ */
export type BattleRoundType = 'battle' | 'boss' | 'pve';

export type RoundType = BattleRoundType | 'ffa' | 'bonus';

export type RoundScheduleEntry =
  | { readonly roundType: 'battle' }
  | { readonly roundType: 'boss' }
  | { readonly roundType: 'ffa' }
  | { readonly roundType: 'bonus'; readonly bonusIndex: number }
  | { readonly roundType: 'pve' };

/** 戦闘系ラウンド結果（battle / boss / pve / ffa 共通） */
export type CombatRoundResult = {
  readonly roundType: BattleRoundType | 'ffa';
  readonly round: number;
  readonly victory: boolean;
  readonly elapsed: number;
  readonly playerSurvivors: number;
  readonly enemyKills: number;
};

/** ボーナスラウンド結果（勝敗なし、報酬ベース） */
export type BonusRoundResult = {
  readonly roundType: 'bonus';
  readonly round: number;
  readonly elapsed: number;
  readonly enemyKills: number;
  readonly bonusCredits: number;
  readonly bonusPct: number;
};

export type RoundResult = CombatRoundResult | BonusRoundResult;

/** battle-tracker 経由（1v1 戦闘 + ボーナス） */
export type BattleRoundEndInput =
  | { readonly roundType: BattleRoundType; readonly battleResult: BattleResult }
  | { readonly roundType: 'bonus'; readonly battleResult: BattleResult; readonly bonusReward: BonusReward };

/** melee-tracker 経由（FFA） */
export type FfaRoundEndInput = { readonly roundType: 'ffa'; readonly battleResult: BattleResult };

/** processRoundEnd への入力: トラッカー経路別に型で保証 */
export type RoundEndInput = BattleRoundEndInput | FfaRoundEndInput;

export type RunStatus = {
  readonly round: number;
  readonly lives: number;
  readonly wins: number;
  readonly winTarget: number;
  readonly roundType: RoundType;
  /** 前ラウンドのボーナス報酬クレジット（次ラウンドのショップに加算） */
  readonly pendingBonusCredits: number;
};

export type RunResult = {
  readonly cleared: boolean;
  readonly rounds: number;
  readonly wins: number;
  readonly losses: number;
  readonly totalKills: number;
  readonly roundResults: readonly RoundResult[];
};

/** 順次生産スロット */
export type ProductionSlot = {
  readonly type: UnitTypeIndex;
  readonly count: number;
  readonly mergeExp: number;
};

export interface FleetSetup {
  readonly mothershipType: UnitTypeIndex;
  readonly slots: readonly (ProductionSlot | null)[];
}

export type BonusPhaseData = {
  readonly totalHp: number;
  destroyedHp: number;
};

export type BonusReward = {
  readonly bonusCredits: number;
  readonly bonusPct: number;
};

/** チーム1つ分の生産キュー状態。slots（不変）と timers（可変）の並行配列 */
export interface ProductionState {
  /** 不変: 初期化時に確定するスロット配列 */
  readonly slots: readonly (ProductionSlot | null)[];
  /** 可変: slots と並行。各スロットの蓄積時間（秒）。毎tick更新 */
  readonly timers: number[];
}
