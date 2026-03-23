import { MAX_MERGE_LEVEL, mergeExpToLevel } from './merge-config.ts';
import { getMothershipDef } from './mothership-defs.ts';
import {
  addCredits,
  clearOffering,
  clearSlot,
  decrementFreeRerolls,
  deductCredits,
  getShopCredits,
  getShopFreeRerolls,
  getShopSellBonus,
  incrementMergeExp,
  initShopRound as initShopRoundState,
  initShop as initShopState,
  isShopRngReady,
  placeSlot,
  readOfferings,
  readSlots,
  regenerateOfferings,
  toggleOfferingLock,
} from './shop-state.ts';
import {
  type PurchaseCheck,
  REROLL_COST,
  SHOP_PRICE,
  type ShopItem,
  sellPrice,
  slotsToProduction,
} from './shop-tiers.ts';
import type { UnitTypeIndex } from './types.ts';
import type { FleetSetup } from './types-fleet.ts';
import { TYPES } from './unit-types.ts';

// --- 通知ロジック（モジュールローカル） ---

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

export function _resetShopListeners(): void {
  listeners.length = 0;
}

// --- lifecycle ラッパー（state mutation → notify） ---

export function initShop(slotCount?: number): void {
  initShopState(slotCount);
  notifyChange();
}

export function initShopRound(
  rng: () => number,
  round: number,
  bonusCredits?: number,
  mothershipType?: UnitTypeIndex,
): void {
  initShopRoundState(rng, round, bonusCredits, mothershipType);
  notifyChange();
}

// --- query re-export (noBarrelFile 対策: import + 個別 export) ---

import { snapshotOfferings, snapshotSlots } from './shop-state.ts';
export { getShopCredits, getShopFreeRerolls, snapshotOfferings, snapshotSlots };

export type BuyTarget = { idx: number; isMerge: boolean };

/** 購入先スロット判定（マージ優先 → 空スロット）。1パス走査。 */
export function findBuyTarget(typeIdx: UnitTypeIndex): BuyTarget {
  const slots = readSlots();
  let firstEmpty = -1;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.type === typeIdx && mergeExpToLevel(s.mergeExp) < MAX_MERGE_LEVEL) {
      return { idx: i, isMerge: true };
    }
    if (s === null && firstEmpty < 0) {
      firstEmpty = i;
    }
  }
  return { idx: firstEmpty, isMerge: false };
}

/** 売却時の獲得クレジット計算 */
export function calculateSellCredit(mergeExp: number): number {
  return sellPrice(mergeExp) + getShopSellBonus();
}

/** offering 単位の購入可否チェック。'ok' = 購入可能 */
function checkPurchase(item: ShopItem): PurchaseCheck {
  if (getShopCredits() < SHOP_PRICE) {
    return 'no_credits';
  }
  const target = findBuyTarget(item.type);
  if (target.isMerge) {
    return 'ok';
  }
  // マージ不可 + 同タイプ既存 → ★3到達（重複配置禁止）
  const slots = readSlots();
  if (slots.some((s) => s !== null && s.type === item.type)) {
    return 'max_star';
  }
  if (target.idx >= 0) {
    return 'ok'; // 空スロットあり
  }
  return 'slots_full';
}

/** offerings[idx] の購入可否を返す。'ok' = 購入可能 */
export function canPurchaseItem(offeringIdx: number): PurchaseCheck {
  const offerings = readOfferings();
  const item = offerings[offeringIdx];
  if (!item) {
    return 'sold_out';
  }
  return checkPurchase(item);
}

/** 全 offering の購入可否を一括計算 */
export function getShopPurchaseBlocks(): PurchaseCheck[] {
  return readOfferings().map((item) => {
    if (!item) {
      return 'sold_out';
    }
    return checkPurchase(item);
  });
}

/** 購入: offerings[idx] → スロットへ配置 or マージ。成功 true */
export function purchaseItem(offeringIdx: number, expectedTarget?: BuyTarget): boolean {
  const offerings = readOfferings();
  const item = offerings[offeringIdx];
  if (!item) {
    return false;
  }
  if (checkPurchase(item) !== 'ok') {
    return false;
  }

  const target = findBuyTarget(item.type);
  if (expectedTarget && (target.idx !== expectedTarget.idx || target.isMerge !== expectedTarget.isMerge)) {
    return false;
  }

  if (target.isMerge) {
    deductCredits(SHOP_PRICE);
    incrementMergeExp(target.idx);
    clearOffering(offeringIdx);
    notifyChange();
    return true;
  }

  if (target.idx >= 0) {
    deductCredits(SHOP_PRICE);
    const t = TYPES[item.type];
    const baseCount = t?.clusterSize ?? 1;
    placeSlot(target.idx, { type: item.type, baseCount, mergeExp: 0 });
    clearOffering(offeringIdx);
    notifyChange();
    return true;
  }

  return false;
}

export function sellSlot(slotIdx: number): boolean {
  const slots = readSlots();
  const s = slots[slotIdx];
  if (!s) {
    return false;
  }
  addCredits(calculateSellCredit(s.mergeExp));
  clearSlot(slotIdx);
  notifyChange();
  return true;
}

export function rerollOfferings(): boolean {
  if (!isShopRngReady()) {
    throw new Error('shopRng not initialized — call initShopRound first');
  }
  if (getShopFreeRerolls() > 0) {
    decrementFreeRerolls();
    regenerateOfferings();
    notifyChange();
    return true;
  }
  if (getShopCredits() < REROLL_COST) {
    return false;
  }
  deductCredits(REROLL_COST);
  regenerateOfferings();
  notifyChange();
  return true;
}

export function toggleLock(offeringIdx: number): void {
  if (toggleOfferingLock(offeringIdx)) {
    notifyChange();
  }
}

export function buildFleetFromShop(mothershipType: UnitTypeIndex): FleetSetup {
  return { mothershipType, slots: slotsToProduction(readSlots(), getMothershipDef(mothershipType).spawnCountMul) };
}
