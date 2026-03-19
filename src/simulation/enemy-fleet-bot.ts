import { DEFAULT_SLOT_COUNT } from '../production-config.ts';
import type { ShopSlot, WeightedCandidate } from '../shop-tiers.ts';
import { buildWeightedCandidates, MAX_MERGE_LEVEL, mergeExpToLevel, SHOP_PRICE } from '../shop-tiers.ts';
import type { UnitTypeIndex } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { weightedPick } from '../weighted-pick.ts';

function mergeProbability(round: number): number {
  return Math.min(0.8, 0.4 + round * 0.05);
}

type MergeOutcome = { spent: number; targetIdx: number; result: 'merged' } | { result: 'skipped' | 'impossible' };

function tryMerge(
  rng: () => number,
  slots: (ShopSlot | null)[],
  candidates: WeightedCandidate[],
  round: number,
  forceMerge: boolean,
  credits: number,
): MergeOutcome {
  if (credits < SHOP_PRICE) {
    return { result: 'impossible' };
  }
  const mergeables = candidates.filter((c) =>
    slots.some((s) => s !== null && s.type === c.idx && mergeExpToLevel(s.mergeExp) < MAX_MERGE_LEVEL),
  );
  if (mergeables.length === 0) {
    return { result: 'impossible' };
  }
  if (!forceMerge && rng() >= mergeProbability(round)) {
    return { result: 'skipped' };
  }
  const picked = weightedPick(mergeables, rng);
  const entry = mergeables[picked];
  if (!entry) {
    return { result: 'impossible' };
  }
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.type === entry.idx && mergeExpToLevel(s.mergeExp) < MAX_MERGE_LEVEL) {
      return { spent: SHOP_PRICE, targetIdx: i, result: 'merged' };
    }
  }
  return { result: 'impossible' };
}

/** 空スロットへの新規配置。成功時は消費クレジットを返す。失敗時は 0 */
function tryPlaceNew(
  rng: () => number,
  slots: (ShopSlot | null)[],
  candidates: WeightedCandidate[],
  slotTypes: Set<UnitTypeIndex>,
  credits: number,
): number {
  if (credits < SHOP_PRICE) {
    return 0;
  }
  const emptyIdx = slots.indexOf(null);
  if (emptyIdx < 0) {
    return 0;
  }
  const fresh = candidates.filter((c) => !slotTypes.has(c.idx));
  if (fresh.length === 0) {
    return 0;
  }
  const picked = weightedPick(fresh, rng);
  const entry = fresh[picked];
  if (!entry) {
    return 0;
  }
  const baseCount = TYPES[entry.idx]?.clusterSize ?? 1;
  slots[emptyIdx] = { type: entry.idx, baseCount, mergeExp: 0 };
  slotTypes.add(entry.idx);
  return SHOP_PRICE;
}

function applyMerge(slots: (ShopSlot | null)[], outcome: MergeOutcome & { result: 'merged' }): void {
  const target = slots[outcome.targetIdx];
  if (!target) {
    throw new Error(`botFillSlots: merged slot at ${outcome.targetIdx} is null`);
  }
  target.mergeExp += 1;
}

/**
 * ショップと同じ制約（クレジット・ティア重み・マージ）でスロットを構築する。
 * 戦略: マージ優先 → 空スロット配置 → 予算完全消化
 */
export function botFillSlots(
  rng: () => number,
  round: number,
  budget: number,
  slotCount: number = DEFAULT_SLOT_COUNT,
): readonly (ShopSlot | null)[] {
  const slots: (ShopSlot | null)[] = Array.from({ length: slotCount }, () => null);
  let credits = budget;
  const candidates = buildWeightedCandidates(round);
  const slotTypes = new Set<UnitTypeIndex>();
  let consecutiveSkips = 0;
  const maxSteps = Math.ceil(budget / SHOP_PRICE) * 4;

  for (let step = 0; step < maxSteps && credits > 0; step++) {
    // フェーズ1: マージ試行
    const outcome = tryMerge(rng, slots, candidates, round, consecutiveSkips >= 3, credits);
    if (outcome.result === 'merged') {
      applyMerge(slots, outcome);
      credits -= outcome.spent;
      consecutiveSkips = 0;
      continue;
    }

    // フェーズ2: 新規配置試行
    const placed = tryPlaceNew(rng, slots, candidates, slotTypes, credits);
    if (placed > 0) {
      credits -= placed;
      consecutiveSkips = 0;
      continue;
    }

    // フェーズ3: 両方失敗 — マージ可能ユニットが存在しないなら終了
    if (outcome.result === 'impossible') {
      break;
    }
    // マージ可能だが RNG でスキップされた → 連続スキップをカウントし強制マージへ
    consecutiveSkips++;
  }

  return slots;
}
