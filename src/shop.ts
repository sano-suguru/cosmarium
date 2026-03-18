import { getMothershipDef } from './mothership-defs.ts';
import { SLOT_COUNT } from './production-config.ts';
import {
  buildWeightedCandidates,
  MAX_MERGE_LEVEL,
  mergeExpToLevel,
  type PurchaseBlock,
  REROLL_COST,
  ROUND_CREDITS,
  SHOP_PRICE,
  SHOP_SIZE,
  type ShopItem,
  type ShopSlot,
  sellPrice,
  slotsToProduction,
} from './shop-tiers.ts';
import type { UnitTypeIndex } from './types.ts';
import { NO_TYPE } from './types.ts';
import type { FleetSetup } from './types-fleet.ts';
import { TYPES } from './unit-types.ts';
import { weightedPick } from './weighted-pick.ts';

// ── ショップ状態 ─────────────────────────────────────────────────

type ShopState = {
  credits: number;
  readonly offerings: (ShopItem | null)[];
  readonly slots: (ShopSlot | null)[];
};

function createShopState(): ShopState {
  return {
    credits: 0,
    offerings: Array.from({ length: SHOP_SIZE }, () => null),
    slots: Array.from({ length: SLOT_COUNT }, () => null),
  };
}

const shop: ShopState = createShopState();

const listeners: (() => void)[] = [];

function notifyChange(): void {
  for (const cb of listeners) {
    cb();
  }
}

export function onShopChange(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) {
      listeners.splice(idx, 1);
    }
  };
}

// ── ショップ RNG + ラウンド ──────────────────────────────────────

let shopRng: (() => number) | null = null;
let shopRound = 1;

// ── offerings 生成 ───────────────────────────────────────────────

function generateOfferings(rng: () => number, round: number): void {
  const candidates = buildWeightedCandidates(round);

  for (let i = 0; i < SHOP_SIZE; i++) {
    if (shop.offerings[i]?.locked) {
      continue; // locked は保持
    }
    if (candidates.length === 0) {
      shop.offerings[i] = null;
      continue;
    }
    const picked = weightedPick(candidates, rng);
    const entry = candidates[picked];
    if (!entry) {
      shop.offerings[i] = null;
      continue;
    }
    shop.offerings[i] = { type: entry.idx, locked: false };
  }
}

// ── Public API ───────────────────────────────────────────────────

export function initShop(): void {
  shop.credits = 0;
  shopRng = null;
  shopRound = 1;
  for (let i = 0; i < SHOP_SIZE; i++) {
    shop.offerings[i] = null;
  }
  for (let i = 0; i < SLOT_COUNT; i++) {
    shop.slots[i] = null;
  }
  notifyChange();
}

export function initShopRound(
  rng: () => number,
  round: number,
  bonusCredits = 0,
  mothershipType: UnitTypeIndex = NO_TYPE,
): void {
  const msCredits = getMothershipDef(mothershipType).creditsPerRound;
  shop.credits = ROUND_CREDITS + bonusCredits + msCredits;
  shopRng = rng;
  shopRound = round;
  generateOfferings(rng, round);
  notifyChange();
}

/** 同タイプスロットへのマージ試行。成功ならスロットindex、不可なら -1 */
function tryMergeSlot(typeIdx: UnitTypeIndex): number {
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = shop.slots[i];
    if (s && s.type === typeIdx && mergeExpToLevel(s.mergeExp) < MAX_MERGE_LEVEL) {
      return i;
    }
  }
  return -1;
}

/** offering 単位の購入可否チェック。null = 購入可能 */
function checkPurchase(item: ShopItem): PurchaseBlock | null {
  if (shop.credits < SHOP_PRICE) {
    return 'no_credits';
  }
  const mergeIdx = tryMergeSlot(item.type);
  if (mergeIdx >= 0) {
    return null; // マージ可能
  }
  // マージ不可 + 同タイプ既存 → ★3到達
  if (shop.slots.some((s) => s !== null && s.type === item.type)) {
    return 'max_star';
  }
  // 空スロットなし → 満杯
  if (!shop.slots.some((s) => s === null)) {
    return 'slots_full';
  }
  return null;
}

/** offerings[idx] の購入可否を返す。null = 購入可能 */
export function canPurchaseItem(offeringIdx: number): PurchaseBlock | null {
  const item = shop.offerings[offeringIdx];
  if (!item) {
    return 'sold_out';
  }
  return checkPurchase(item);
}

/** 全 offering の購入可否を一括計算 */
export function getShopPurchaseBlocks(): (PurchaseBlock | null)[] {
  return shop.offerings.map((item) => {
    if (!item) {
      return 'sold_out';
    }
    return checkPurchase(item);
  });
}

/** 購入: offerings[idx] → スロットへ配置 or マージ。成功 true */
export function purchaseItem(offeringIdx: number): boolean {
  const item = shop.offerings[offeringIdx];
  if (!item) {
    return false;
  }
  if (checkPurchase(item) !== null) {
    return false;
  }

  // 既存スロットに同タイプがあればマージ
  const mergeIdx = tryMergeSlot(item.type);
  if (mergeIdx >= 0) {
    const s = shop.slots[mergeIdx];
    if (s) {
      shop.credits -= SHOP_PRICE;
      s.mergeExp += 1;
      shop.offerings[offeringIdx] = null;
      notifyChange();
      return true;
    }
  }

  // 空スロットに配置
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (shop.slots[i] === null) {
      shop.credits -= SHOP_PRICE;
      const t = TYPES[item.type];
      const baseCount = t?.clusterSize ?? 1;
      shop.slots[i] = { type: item.type, baseCount, mergeExp: 0 };
      shop.offerings[offeringIdx] = null;
      notifyChange();
      return true;
    }
  }

  return false;
}

export function sellSlot(slotIdx: number): boolean {
  const s = shop.slots[slotIdx];
  if (!s) {
    return false;
  }
  shop.credits += sellPrice(s.mergeExp);
  shop.slots[slotIdx] = null;
  notifyChange();
  return true;
}

export function rerollOfferings(): boolean {
  if (!shopRng) {
    throw new Error('shopRng not initialized — call initShopRound first');
  }
  if (shop.credits < REROLL_COST) {
    return false;
  }
  shop.credits -= REROLL_COST;
  generateOfferings(shopRng, shopRound);
  notifyChange();
  return true;
}

export function toggleLock(offeringIdx: number): void {
  const item = shop.offerings[offeringIdx];
  if (item) {
    item.locked = !item.locked;
    notifyChange();
  }
}

export function buildFleetFromShop(mothershipType: UnitTypeIndex): FleetSetup {
  return { mothershipType, slots: slotsToProduction(shop.slots, getMothershipDef(mothershipType).spawnCountMul) };
}

export function getShopCredits(): number {
  return shop.credits;
}

export function getShopOfferings(): readonly (ShopItem | null)[] {
  return [...shop.offerings];
}

export function getShopSlots(): readonly (ShopSlot | null)[] {
  return [...shop.slots];
}

// ── テスト専用 ──────────────────────────────────────────────────

export function _resetShopListeners(): void {
  listeners.length = 0;
}

export function _setShopSlot(idx: number, slot: ShopSlot | null): void {
  shop.slots[idx] = slot;
}

export function _setShopCredits(credits: number): void {
  shop.credits = credits;
}

export function _setShopRng(rng: () => number): void {
  shopRng = rng;
}
