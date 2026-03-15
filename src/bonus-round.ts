import type { UnitTypeIndex } from './types.ts';
import type { BonusPhaseData, BonusReward } from './types-fleet.ts';
import { unitType } from './unit-type-accessors.ts';

/** ボーナスラウンドの制限時間（シミュレーション秒） */
export const BONUS_TIME_LIMIT = 60;

/** 全撃破時の基本報酬 */
const BONUS_CR_BASE = 6;
/** 全撃破ボーナス */
const BONUS_CR_SWEEP = 2;
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

/** environment ロール検証付きボーナスキル記録（撃破ユニットの最大HPを加算） */
export function recordBonusKill(bd: BonusPhaseData, victimType: UnitTypeIndex): void {
  const ut = unitType(victimType);
  if (ut.role === 'environment') {
    bd.destroyedHp += ut.hp;
  }
}

/** ボーナスラウンドの撃破報酬クレジットを計算（質量ベース） */
export function computeBonusCredits(destroyedHp: number, totalHp: number): number {
  if (destroyedHp <= 0 || totalHp <= 0) {
    return 0;
  }
  const ratio = Math.min(destroyedHp / totalHp, 1);
  const base = Math.floor(ratio * BONUS_CR_BASE);
  const sweep = destroyedHp >= totalHp ? BONUS_CR_SWEEP : 0;
  return Math.min(base + sweep, BONUS_CR_MAX);
}
