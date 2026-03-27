import { MAX_MERGE_LEVEL, mergeExpToLevel } from './merge-config.ts';
import { getMothershipDef } from './mothership-defs.ts';
import {
  addCredits,
  clearModuleOffering,
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
  readModuleOfferings,
  readOfferings,
  readSlots,
  regenerateOfferings,
  setSlotModule,
  toggleModuleOfferingLock,
  toggleOfferingLock,
} from './shop-state.ts';
import {
  MODULE_REFUND,
  type PurchaseCheck,
  REROLL_COST,
  SHOP_PRICE,
  type ShopItem,
  sellPrice,
  slotsToProduction,
} from './shop-tiers.ts';
import type { UnitTypeIndex } from './types.ts';
import { NO_MODULE } from './types.ts';
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

import { snapshotModuleOfferings, snapshotOfferings, snapshotSlots } from './shop-state.ts';
export { getShopCredits, getShopFreeRerolls, snapshotModuleOfferings, snapshotOfferings, snapshotSlots };

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
export function calculateSellCredit(mergeExp: number, hasModule: boolean): number {
  return sellPrice(mergeExp) + getShopSellBonus() + (hasModule ? MODULE_REFUND : 0);
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
    placeSlot(target.idx, { type: item.type, baseCount, mergeExp: 0, moduleId: NO_MODULE });
    clearOffering(offeringIdx);
    notifyChange();
    return true;
  }

  return false;
}

// --- モジュール購入 ---

/** モジュール offering 単位の購入可否チェック（装着先スロット不問） */
function canPurchaseModule(offeringIdx: number): PurchaseCheck {
  const offerings = readModuleOfferings();
  const item = offerings[offeringIdx];
  if (!item) {
    return 'sold_out';
  }
  if (getShopCredits() < SHOP_PRICE) {
    return 'no_credits';
  }
  const slots = readSlots();
  if (!slots.some((s) => s !== null)) {
    return 'no_target';
  }
  return 'ok';
}

/** 特定スロットへのモジュール装着可否チェック (true = 装着可能) */
export function canFitModule(targetSlotIdx: number): boolean {
  const slots = readSlots();
  return targetSlotIdx >= 0 && targetSlotIdx < slots.length && slots[targetSlotIdx] !== null;
}

/** 全モジュール offering の購入可否を一括計算 */
export function getModulePurchaseBlocks(): PurchaseCheck[] {
  return readModuleOfferings().map((item, i) => {
    if (!item) {
      return 'sold_out';
    }
    return canPurchaseModule(i);
  });
}

/** モジュール購入: moduleOfferings[offeringIdx] → slots[targetSlotIdx] に装着 */
export function purchaseModule(offeringIdx: number, targetSlotIdx: number): boolean {
  if (canPurchaseModule(offeringIdx) !== 'ok') {
    return false;
  }
  if (!canFitModule(targetSlotIdx)) {
    return false;
  }
  const offerings = readModuleOfferings();
  const item = offerings[offeringIdx];
  if (!item) {
    throw new Error(`purchaseModule: offering ${offeringIdx} is null after canPurchaseModule passed`);
  }
  const slots = readSlots();
  const targetSlot = slots[targetSlotIdx];
  if (!targetSlot) {
    throw new Error(`purchaseModule: slot ${targetSlotIdx} is null after canFitModule passed`);
  }
  const hasExisting = targetSlot.moduleId !== NO_MODULE;
  deductCredits(SHOP_PRICE);
  if (hasExisting) {
    addCredits(MODULE_REFUND);
  }
  setSlotModule(targetSlotIdx, item.moduleId);
  clearModuleOffering(offeringIdx);
  notifyChange();
  return true;
}

/** モジュール枠のロック切り替え */
export function toggleModuleLock(offeringIdx: number): void {
  if (toggleModuleOfferingLock(offeringIdx)) {
    notifyChange();
  }
}

export function sellSlot(slotIdx: number): boolean {
  const slots = readSlots();
  const s = slots[slotIdx];
  if (!s) {
    return false;
  }
  addCredits(calculateSellCredit(s.mergeExp, s.moduleId !== NO_MODULE));
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
