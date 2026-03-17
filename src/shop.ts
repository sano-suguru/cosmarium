import { SLOT_COUNT } from './production-config.ts';
import {
  buildWeightedCandidates,
  REROLL_COST,
  ROUND_CREDITS,
  SHOP_SIZE,
  type ShopItem,
  type ShopSlot,
  sellPrice,
  slotsToProduction,
} from './shop-tiers.ts';
import type { UnitTypeIndex } from './types.ts';
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
    shop.offerings[i] = { type: entry.idx, shopPrice: entry.price, locked: false };
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

export function initShopRound(rng: () => number, round: number, bonusCredits = 0): void {
  shop.credits = ROUND_CREDITS + bonusCredits;
  shopRng = rng;
  shopRound = round;
  generateOfferings(rng, round);
  notifyChange();
}

/** 購入: offerings[idx] → スロットへ配置 or マージ。成功 true */
export function purchaseItem(offeringIdx: number): boolean {
  const item = shop.offerings[offeringIdx];
  if (!item) {
    return false;
  }
  if (shop.credits < item.shopPrice) {
    return false;
  }

  // 既存スロットに同タイプがあればマージ
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = shop.slots[i];
    if (s && s.type === item.type) {
      shop.credits -= item.shopPrice;
      s.mergeLevel += 1;
      shop.offerings[offeringIdx] = null;
      notifyChange();
      return true;
    }
  }

  // 空スロットに配置
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (shop.slots[i] === null) {
      shop.credits -= item.shopPrice;
      const t = TYPES[item.type];
      const baseCount = t?.clusterSize ?? 1;
      shop.slots[i] = { type: item.type, baseCount, mergeLevel: 0 };
      shop.offerings[offeringIdx] = null;
      notifyChange();
      return true;
    }
  }

  return false; // 全スロット満杯
}

export function sellSlot(slotIdx: number): boolean {
  const s = shop.slots[slotIdx];
  if (!s) {
    return false;
  }
  shop.credits += sellPrice(s.type, s.mergeLevel);
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
  return { mothershipType, slots: slotsToProduction(shop.slots) };
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
