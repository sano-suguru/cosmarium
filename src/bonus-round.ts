import type { BonusPhaseData, BonusReward } from './types-fleet.ts';

/** ボーナスラウンドの制限時間（シミュレーション秒） */
export const BONUS_TIME_LIMIT = 60;

/** 報酬上限 */
const BONUS_CR_MAX = 8;

/** BonusPhaseData ファクトリ */
export function createBonusData(totalHp: number): BonusPhaseData {
  return { totalHp, destroyedHp: 0 };
}

/** ボーナスラウンドの報酬を一括計算（ゼロ除算ガード付き） */
export function buildBonusResult(bd: BonusPhaseData): BonusReward {
  return {
    bonusCredits: computeBonusCredits(bd.destroyedHp, bd.totalHp),
    bonusPct: bd.totalHp > 0 ? Math.round((bd.destroyedHp / bd.totalHp) * 100) : 0,
  };
}

/** 撃破ユニットの実 maxHp を加算（role チェックは呼び出し元で実施済み） */
export function recordBonusKill(bd: BonusPhaseData, victimMaxHp: number): void {
  bd.destroyedHp += victimMaxHp;
}

/** ボーナスラウンドの撃破報酬クレジットを計算（平方根カーブ） */
export function computeBonusCredits(destroyedHp: number, totalHp: number): number {
  if (destroyedHp <= 0 || totalHp <= 0) {
    return 0;
  }
  const ratio = Math.min(destroyedHp / totalHp, 1);
  return Math.min(Math.floor(Math.sqrt(ratio) * BONUS_CR_MAX), BONUS_CR_MAX);
}
