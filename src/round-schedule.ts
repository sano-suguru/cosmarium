import type { RoundScheduleEntry } from './types-fleet.ts';

export const BOSS_PERIOD = 7;
export const FFA_PERIOD = 5;
export const BONUS_OFFSET = 3;

/** ラウンド番号からラウンドタイプを決定する */
export function scheduleRound(round: number): RoundScheduleEntry {
  if (round < 1) {
    throw new Error(`scheduleRound: invalid round ${round}`);
  }
  if (round % BOSS_PERIOD === 0) {
    return { roundType: 'boss', preview: true } as const;
  }
  if (round % FFA_PERIOD === 0) {
    return { roundType: 'ffa', preview: true } as const;
  }
  if (round >= BONUS_OFFSET && round % FFA_PERIOD === BONUS_OFFSET) {
    return { roundType: 'bonus', preview: true, bonusIndex: Math.floor((round - BONUS_OFFSET) / FFA_PERIOD) };
  }
  return { roundType: 'battle', preview: false } as const;
}

const BOSS_ESCALATION_EVERY = 2;
const BOSS_BASE_MUL = 1.5;
const BOSS_STEP_MUL = 0.5;
/** ボス予算倍率の上限。Colossus 3スロット × MAX_MERGE の理論飽和 5.4 より低め */
export const BOSS_MAX_MUL = 5.0;

/** ボスラウンドの予算倍率を返す（ラウンド進行に応じてエスカレーション、BOSS_MAX_MUL でクランプ） */
export function bossBudgetMul(round: number): number {
  if (round % BOSS_PERIOD !== 0) {
    throw new Error(`bossBudgetMul: round ${round} is not a boss round (must be multiple of ${BOSS_PERIOD})`);
  }
  const bossIndex = round / BOSS_PERIOD;
  const raw = BOSS_BASE_MUL + Math.floor(bossIndex / BOSS_ESCALATION_EVERY) * BOSS_STEP_MUL;
  return Math.min(raw, BOSS_MAX_MUL);
}
