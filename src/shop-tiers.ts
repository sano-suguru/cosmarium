import { SORTED_TYPE_INDICES } from './fleet-cost.ts';
import { mergeBonusLevel, mergeExpToLevel } from './merge-config.ts';
import { createProductionSlot } from './production-config.ts';
import type { UnitTypeIndex } from './types.ts';
import type { ProductionSlot } from './types-fleet.ts';
import { unitTypeCost } from './unit-type-accessors.ts';

type Tier = 'low' | 'mid' | 'high';
type TierPhase = 'early' | 'mid' | 'late';
export type WeightedCandidate = { idx: UnitTypeIndex; weight: number };

export type ShopItem = {
  readonly type: UnitTypeIndex;
  locked: boolean;
};

export type ShopSlot = {
  readonly type: UnitTypeIndex;
  readonly baseCount: number;
  mergeExp: number;
};

/** 購入不可の理由 */
export type PurchaseBlock = 'no_credits' | 'max_star' | 'slots_full' | 'sold_out';

/** 購入可否チェック結果。'ok' = 購入可能 */
export type PurchaseCheck = PurchaseBlock | 'ok';

export const ROUND_CREDITS = 10;
export const REROLL_COST = 1;
export const SHOP_SIZE = 5;
export const SHOP_PRICE = 3;

/** ラウンド依存のティア重み。[low, mid, high] を返す */
const TIER_WEIGHTS: Record<TierPhase, readonly [number, number, number]> = {
  early: [3, 1, 0],
  mid: [2, 2, 1],
  late: [1, 2, 2],
};

const TIER_IDX: Record<Tier, 0 | 1 | 2> = { low: 0, mid: 1, high: 2 };

function mergeBonusCount(baseCount: number): number {
  return Math.max(1, Math.floor(baseCount * 0.5));
}

export function effectiveCount(slot: ShopSlot): number {
  return slot.baseCount + mergeBonusLevel(slot.mergeExp) * mergeBonusCount(slot.baseCount);
}

export function spawnCount(slot: ShopSlot, spawnCountMul: number): number {
  return Math.max(1, Math.round(effectiveCount(slot) * spawnCountMul));
}

export const COST_LOW_MAX = 3;
export const COST_MID_MAX = 6;

function costTier(typeIdx: UnitTypeIndex): Tier {
  const cost = unitTypeCost(typeIdx);
  if (cost <= COST_LOW_MAX) {
    return 'low';
  }
  if (cost <= COST_MID_MAX) {
    return 'mid';
  }
  return 'high';
}

function tierWeight(tier: Tier, round: number): number {
  let phase: TierPhase = 'late';
  if (round <= 3) {
    phase = 'early';
  } else if (round <= 6) {
    phase = 'mid';
  }
  return TIER_WEIGHTS[phase][TIER_IDX[tier]];
}

export function buildWeightedCandidates(round: number): WeightedCandidate[] {
  const candidates: WeightedCandidate[] = [];
  for (const idx of SORTED_TYPE_INDICES) {
    const w = tierWeight(costTier(idx), round);
    if (w > 0) {
      candidates.push({ idx, weight: w });
    }
  }
  return candidates;
}

export function slotsToProduction(
  slots: readonly (ShopSlot | null)[],
  spawnCountMul: number,
): (ProductionSlot | null)[] {
  return slots.map((s) => {
    if (!s) {
      return null;
    }
    return createProductionSlot(s.type, spawnCount(s, spawnCountMul), s.mergeExp);
  });
}

/** 売却額 = レベルと同額（GDD §3-D: Lv1=1Cr, Lv2=2Cr, Lv3=3Cr） */
export function sellPrice(mergeExp: number): number {
  return mergeExpToLevel(mergeExp);
}
