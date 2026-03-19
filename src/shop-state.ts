import { getMothershipDef } from './mothership-defs.ts';
import { DEFAULT_SLOT_COUNT } from './production-config.ts';
import { buildWeightedCandidates, ROUND_CREDITS, SHOP_SIZE, type ShopItem, type ShopSlot } from './shop-tiers.ts';
import type { UnitTypeIndex } from './types.ts';
import { NO_TYPE } from './types.ts';
import { weightedPick } from './weighted-pick.ts';

type ShopState = {
  credits: number;
  freeRerolls: number;
  sellBonus: number;
  readonly offerings: (ShopItem | null)[];
  readonly slots: (ShopSlot | null)[];
};

function createShopState(): ShopState {
  return {
    credits: 0,
    freeRerolls: 0,
    sellBonus: 0,
    offerings: Array.from({ length: SHOP_SIZE }, () => null),
    slots: Array.from({ length: DEFAULT_SLOT_COUNT }, () => null),
  };
}

const shop: ShopState = createShopState();

let shopRng: (() => number) | null = null;
let shopRound = 1;

function generateOfferings(rng: () => number, round: number): void {
  const candidates = buildWeightedCandidates(round);

  for (let i = 0; i < SHOP_SIZE; i++) {
    if (shop.offerings[i]?.locked) {
      continue;
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

function resizeSlots(slotCount: number): void {
  const cur = shop.slots.length;
  if (cur === slotCount) {
    return;
  }
  for (let i = slotCount; i < cur; i++) {
    if (shop.slots[i] !== null) {
      throw new Error(`resizeSlots: cannot truncate populated slot at index ${i}`);
    }
  }
  shop.slots.length = slotCount;
  for (let i = cur; i < slotCount; i++) {
    shop.slots[i] = null;
  }
}

export function initShop(slotCount: number = DEFAULT_SLOT_COUNT): void {
  shop.credits = 0;
  shop.freeRerolls = 0;
  shop.sellBonus = 0;
  shopRng = null;
  shopRound = 1;
  for (let i = 0; i < SHOP_SIZE; i++) {
    shop.offerings[i] = null;
  }
  shop.slots.length = 0;
  for (let i = 0; i < slotCount; i++) {
    shop.slots.push(null);
  }
}

export function initShopRound(
  rng: () => number,
  round: number,
  bonusCredits = 0,
  mothershipType: UnitTypeIndex = NO_TYPE,
): void {
  const def = getMothershipDef(mothershipType);
  // fail-fast: resizeSlots は populated スロットの切り詰めで例外を投げうるため、
  // 状態変更より先に呼ぶことで、失敗時に shop 状態が未変更のままになることを保証する
  resizeSlots(def.slotCount);
  shop.credits = ROUND_CREDITS + bonusCredits + def.creditsPerRound;
  shop.freeRerolls = def.freeRerolls;
  shop.sellBonus = def.sellBonus;
  shopRng = rng;
  shopRound = round;
  generateOfferings(rng, round);
}

export function getShopCredits(): number {
  return shop.credits;
}

export function getShopFreeRerolls(): number {
  return shop.freeRerolls;
}

/** 内部ロジック用: コピーなしの直接参照（readonly） */
export function readOfferings(): readonly (ShopItem | null)[] {
  return shop.offerings;
}

/** 内部ロジック用: コピーなしの直接参照（readonly） */
export function readSlots(): readonly (ShopSlot | null)[] {
  return shop.slots;
}

/** UI signal 同期・テスト値保存用: スプレッドコピー */
export function snapshotOfferings(): readonly (ShopItem | null)[] {
  return [...shop.offerings];
}

/** UI signal 同期・テスト値保存用: スプレッドコピー */
export function snapshotSlots(): readonly (ShopSlot | null)[] {
  return [...shop.slots];
}

export function getShopSellBonus(): number {
  return shop.sellBonus;
}

export function isShopRngReady(): boolean {
  return shopRng !== null;
}

export function deductCredits(amount: number): void {
  shop.credits -= amount;
}

export function addCredits(amount: number): void {
  shop.credits += amount;
}

export function clearOffering(idx: number): void {
  shop.offerings[idx] = null;
}

export function toggleOfferingLock(idx: number): boolean {
  const item = shop.offerings[idx];
  if (!item) {
    return false;
  }
  item.locked = !item.locked;
  return true;
}

export function placeSlot(idx: number, slot: ShopSlot): void {
  shop.slots[idx] = slot;
}

export function clearSlot(idx: number): void {
  shop.slots[idx] = null;
}

export function incrementMergeExp(slotIdx: number): void {
  const s = shop.slots[slotIdx];
  if (s) {
    s.mergeExp += 1;
  }
}

export function decrementFreeRerolls(): void {
  shop.freeRerolls--;
}

export function regenerateOfferings(): void {
  if (!shopRng) {
    throw new Error('shopRng not initialized — call initShopRound first');
  }
  generateOfferings(shopRng, shopRound);
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
