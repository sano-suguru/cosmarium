import { createProductionSlot, filledSlots, SLOT_COUNT } from '../production-config.ts';
import type { ShopSlot, WeightedCandidate } from '../shop-tiers.ts';
import { buildWeightedCandidates, ROUND_CREDITS, shopPrice, slotsToProduction } from '../shop-tiers.ts';
import type { UnitRole, UnitTypeIndex } from '../types.ts';
import type { FleetSetup, MothershipVariant } from '../types-fleet.ts';
import { BASTION_TYPE, DRONE_TYPE, REFLECTOR_TYPE } from '../unit-type-accessors.ts';
import { TYPES } from '../unit-types.ts';
import { weightedPick } from '../weighted-pick.ts';

/** 最悪ケース: 1ステップ最小消費=1cr × (1 + 最大連続スキップ3) */
const MAX_BOT_STEPS = ROUND_CREDITS * 4;

function mergeProbability(round: number): number {
  return Math.min(0.8, 0.4 + round * 0.05);
}

// ── Bot購入シミュレーション ─────────────────────────────────────

type MergeOutcome = { spent: number; targetIdx: number; result: 'merged' } | { result: 'skipped' | 'impossible' };

function tryMerge(
  rng: () => number,
  slots: (ShopSlot | null)[],
  candidates: WeightedCandidate[],
  slotTypes: Set<UnitTypeIndex>,
  credits: number,
  round: number,
  forceMerge: boolean,
): MergeOutcome {
  const mergeables = candidates.filter((c) => c.price <= credits && slotTypes.has(c.idx));
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
    if (s && s.type === entry.idx) {
      return { spent: entry.price, targetIdx: i, result: 'merged' };
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
  const emptyIdx = slots.indexOf(null);
  if (emptyIdx < 0) {
    return 0;
  }
  const affordables = candidates.filter((c) => c.price <= credits);
  if (affordables.length === 0) {
    return 0;
  }
  const fresh = affordables.filter((c) => !slotTypes.has(c.idx));
  if (fresh.length === 0) {
    return 0;
  }
  const picked = weightedPick(fresh, rng);
  const entry = fresh[picked];
  if (!entry) {
    return 0;
  }
  const baseCount = TYPES[entry.idx]?.clusterSize ?? 1;
  slots[emptyIdx] = { type: entry.idx, baseCount, mergeLevel: 0 };
  slotTypes.add(entry.idx);
  return entry.price;
}

function applyMerge(slots: (ShopSlot | null)[], outcome: MergeOutcome & { result: 'merged' }): void {
  const target = slots[outcome.targetIdx];
  if (!target) {
    throw new Error(`botFillSlots: merged slot at ${outcome.targetIdx} is null`);
  }
  target.mergeLevel += 1;
}

/**
 * ショップと同じ制約（クレジット・ティア重み・マージ）でスロットを構築する。
 * 戦略: マージ優先 → 空スロット配置 → 予算完全消化
 */
function botFillSlots(rng: () => number, round: number): readonly (ShopSlot | null)[] {
  const slots: (ShopSlot | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  let credits = ROUND_CREDITS;
  const candidates = buildWeightedCandidates(round);
  const slotTypes = new Set<UnitTypeIndex>();
  let consecutiveSkips = 0;

  for (let step = 0; step < MAX_BOT_STEPS && credits > 0; step++) {
    // フェーズ1: マージ試行
    const outcome = tryMerge(rng, slots, candidates, slotTypes, credits, round, consecutiveSkips >= 3);
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

// ── バリアント選択 ──────────────────────────────────────────────

function variantWeights(profile: FleetProfile): [number, number, number] {
  const { roles, total, hasHigh, allLow } = profile;
  if (total === 0) {
    return [1, 1, 1];
  }
  if (roles.attack / total >= 0.5 || (allLow && roles.attack / total >= 0.3)) {
    return [3, 1, 1]; // Hive
  }
  if (roles.support / total >= 0.4 && hasHigh) {
    return [1, 3, 1]; // Dreadnought
  }
  if (roles.special / total >= 0.4) {
    return [1, 1, 3]; // Reactor
  }
  return [1, 1, 1];
}

function pickVariantFromProfile(rng: () => number, profile: FleetProfile): MothershipVariant {
  const weights = variantWeights(profile);
  const candidates = weights.map((w, i) => ({ weight: w, variant: i as MothershipVariant }));
  const picked = weightedPick(candidates, rng);
  const entry = candidates[picked];
  return entry ? entry.variant : 0;
}

// ── アーキタイプ名導出 ──────────────────────────────────────────

type RoleCounts = Record<UnitRole, number>;

const DEFENSIVE_TYPES = new Set([REFLECTOR_TYPE, BASTION_TYPE]);

type FleetProfile = {
  roles: RoleCounts;
  total: number;
  hasHigh: boolean;
  allLow: boolean;
  hasDefensive: boolean;
};

function profileFleet(slots: readonly (ShopSlot | null)[]): FleetProfile {
  const roles: RoleCounts = { attack: 0, support: 0, special: 0 };
  let total = 0;
  let hasHigh = false;
  let allLow = true;
  let hasDefensive = false;

  for (const s of slots) {
    if (!s) {
      continue;
    }
    total++;
    const t = TYPES[s.type];
    if (!t) {
      continue;
    }
    roles[t.role]++;
    const price = shopPrice(s.type);
    hasHigh = hasHigh || price >= 6;
    allLow = allLow && price <= 3;
    hasDefensive = hasDefensive || DEFENSIVE_TYPES.has(s.type);
  }

  return { roles, total, hasHigh, allLow, hasDefensive };
}

function deriveArchetypeFromProfile(profile: FleetProfile): string {
  const { roles, total, hasHigh, allLow, hasDefensive } = profile;
  if (total === 0) {
    return '混成型';
  }
  if (roles.attack / total >= 0.6) {
    return '攻撃型';
  }
  if (roles.support >= 2 && hasDefensive && roles.attack / total < 0.5) {
    return '防壁型';
  }
  if (roles.support / total >= 0.4) {
    return '支援型';
  }
  if (roles.special / total >= 0.4) {
    return '奇襲型';
  }
  if (allLow) {
    return 'スウォーム型';
  }
  if (hasHigh) {
    return '重装型';
  }
  return '混成型';
}

// ── Public API ──────────────────────────────────────────────────

/**
 * battle 用 — ショップ制約準拠の敵艦隊生成（プロシージャルBot）。
 * プレイヤーと同じクレジット予算・ティア出現率・マージ制約に従う。
 */
export function generateEnemySetup(
  rng: () => number,
  round: number,
): {
  readonly setup: FleetSetup;
  readonly archetypeName: string;
} {
  const botSlots = botFillSlots(rng, round);
  const profile = profileFleet(botSlots);
  const variant = pickVariantFromProfile(rng, profile);

  const productionSlots = slotsToProduction(botSlots);

  // 全 null フォールバック: 最低1つの non-null スロットを保証
  if (filledSlots(productionSlots).length === 0) {
    productionSlots[0] = createProductionSlot(DRONE_TYPE, TYPES[DRONE_TYPE]?.clusterSize ?? 1);
  }

  return { setup: { variant, slots: productionSlots }, archetypeName: deriveArchetypeFromProfile(profile) };
}
