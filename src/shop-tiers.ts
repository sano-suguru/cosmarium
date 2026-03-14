import { SORTED_TYPE_INDICES } from './fleet-cost.ts';
import { createProductionSlot } from './production-config.ts';
import type { UnitTypeIndex } from './types.ts';
import type { ProductionSlot } from './types-fleet.ts';
import { TYPES } from './unit-types.ts';

// ── 型 ──────────────────────────────────────────────────────────

type Tier = 'low' | 'mid' | 'high';
type TierPhase = 'early' | 'mid' | 'late';
export type WeightedCandidate = { idx: UnitTypeIndex; price: number; weight: number };

export type ShopItem = {
  readonly type: UnitTypeIndex;
  readonly shopPrice: number;
  locked: boolean;
};

export type ShopSlot = {
  readonly type: UnitTypeIndex;
  readonly baseCount: number;
  mergeLevel: number;
};

// ── 定数 ─────────────────────────────────────────────────────────

export const ROUND_CREDITS = 10;
export const REROLL_COST = 1;
export const SHOP_SIZE = 5;

/** unitType.cost → shopPrice 圧縮テーブル */
const PRICE_TABLE: readonly [number, number][] = [
  [1, 1],
  [3, 2],
  [4, 3],
  [5, 4],
  [6, 5],
  [8, 6],
  [9, 7],
];
const HIGH_PRICE = 8;

/** ラウンド依存のティア重み。[low, mid, high] を返す */
const TIER_WEIGHTS: Record<TierPhase, readonly [number, number, number]> = {
  early: [3, 1, 0],
  mid: [2, 2, 1],
  late: [1, 2, 2],
};

const TIER_IDX: Record<Tier, 0 | 1 | 2> = { low: 0, mid: 1, high: 2 };

// ── マージ ───────────────────────────────────────────────────────

export function mergeBonusCount(baseCount: number): number {
  return Math.max(1, Math.floor(baseCount * 0.5));
}

export function effectiveCount(slot: ShopSlot): number {
  return slot.baseCount + slot.mergeLevel * mergeBonusCount(slot.baseCount);
}

// ── 価格 ─────────────────────────────────────────────────────────

export function shopPrice(typeIdx: UnitTypeIndex): number {
  const cost = TYPES[typeIdx]?.cost ?? 0;
  for (const [threshold, price] of PRICE_TABLE) {
    if (cost <= threshold) {
      return price;
    }
  }
  return HIGH_PRICE;
}

export function sellPrice(typeIdx: UnitTypeIndex, mergeLevel = 0): number {
  return Math.max(1, Math.floor((shopPrice(typeIdx) * (1 + mergeLevel)) / 2));
}

// ── ティア ────────────────────────────────────────────────────────

function priceTier(price: number): Tier {
  if (price <= 3) {
    return 'low';
  }
  if (price <= 5) {
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
    const price = shopPrice(idx);
    const w = tierWeight(priceTier(price), round);
    if (w > 0) {
      candidates.push({ idx, price, weight: w });
    }
  }
  return candidates;
}

// ── スロット変換 ─────────────────────────────────────────────────

export function slotsToProduction(slots: readonly (ShopSlot | null)[]): (ProductionSlot | null)[] {
  return slots.map((s) => {
    if (!s) {
      return null;
    }
    return createProductionSlot(s.type, effectiveCount(s));
  });
}
