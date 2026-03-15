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

export type RoundType = 'battle' | 'ffa' | 'bonus';

export type RoundScheduleEntry = {
  readonly roundType: RoundType;
  readonly preview: boolean;
};

/** 戦闘系ラウンド結果（battle / ffa 共通） */
export type CombatRoundResult = {
  readonly roundType: 'battle' | 'ffa';
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

/** processRoundEnd への入力: ラウンドタイプと報酬の対応を型で保証 */
export type RoundEndInput =
  | { readonly roundType: 'battle' | 'ffa'; readonly battleResult: BattleResult }
  | { readonly roundType: 'bonus'; readonly battleResult: BattleResult; readonly bonusReward: BonusReward };

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

export type MothershipVariant = 0 | 1 | 2;

/** バリアント未選択 / 未割り当て。MothershipVariantOrNone union で型安全を確保するためブランド化不要 */
export const NO_VARIANT = -1 as const;
export type MothershipVariantOrNone = MothershipVariant | typeof NO_VARIANT;

/** 順次生産スロット */
export type ProductionSlot = {
  readonly type: UnitTypeIndex;
  readonly count: number;
};

export interface FleetSetup {
  readonly variant: MothershipVariant;
  readonly slots: readonly (ProductionSlot | null)[];
}

export const EMPTY_FLEET_SETUP: FleetSetup = { variant: 0, slots: [] };

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
