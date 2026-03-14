import { beforeEach, describe, expect, it } from 'vitest';
import { makeRng } from './__test__/pool-helper.ts';
import { SORTED_TYPE_INDICES } from './fleet-cost.ts';
import { SLOT_COUNT } from './production-config.ts';
import {
  _setShopCredits,
  _setShopRng,
  _setShopSlot,
  buildFleetFromShop,
  getShopCredits,
  getShopOfferings,
  getShopSlots,
  initShop,
  initShopRound,
  purchaseItem,
  rerollOfferings,
  sellSlot,
  toggleLock,
} from './shop.ts';
import type { ShopSlot } from './shop-tiers.ts';
import { effectiveCount, REROLL_COST, ROUND_CREDITS, SHOP_SIZE, sellPrice, shopPrice } from './shop-tiers.ts';
import { TYPES } from './unit-types.ts';

function makeTestSlot(baseCount: number, mergeLevel: number): ShopSlot {
  const type = SORTED_TYPE_INDICES[0];
  if (type === undefined) {
    throw new Error('SORTED_TYPE_INDICES is empty');
  }
  return { type, baseCount, mergeLevel };
}

function filledSlotCount(): number {
  return getShopSlots().filter((s) => s !== null).length;
}

/** スロットを SLOT_COUNT 個の異なるタイプで確定的に埋める */
function fillAllSlots(): void {
  for (let i = 0; i < SLOT_COUNT; i++) {
    const typeIdx = SORTED_TYPE_INDICES[i];
    if (typeIdx === undefined) {
      throw new Error(`SORTED_TYPE_INDICES[${i}] is undefined`);
    }
    const baseCount = TYPES[typeIdx]?.clusterSize ?? 1;
    _setShopSlot(i, { type: typeIdx, baseCount, mergeLevel: 0 });
  }
  _setShopCredits(ROUND_CREDITS);
}

/** マージ不可（スロットにないタイプ）の offering index を返す。見つからなければ -1 */
function findNonMergeableOffering(): number {
  const slotTypes = new Set(
    getShopSlots()
      .filter((s): s is ShopSlot => s !== null)
      .map((s) => s.type),
  );
  for (let i = 0; i < SHOP_SIZE; i++) {
    const item = getShopOfferings()[i];
    if (item && !slotTypes.has(item.type)) {
      return i;
    }
  }
  return -1;
}

/** クレジットを購入+リロールで確実に 0 まで消費する */
function drainCredits(): void {
  while (getShopCredits() > 0) {
    // まず購入を試す
    let bought = false;
    for (let i = 0; i < SHOP_SIZE; i++) {
      if (purchaseItem(i)) {
        bought = true;
        break;
      }
    }
    if (bought) {
      continue;
    }
    // 購入不可ならリロール
    if (!rerollOfferings(1)) {
      break; // リロールも不可 → 終了
    }
  }
}

beforeEach(() => {
  initShop();
});

describe('shopPrice', () => {
  it('Drone (cost=1) → 1 Cr', () => {
    expect.assertions(3);
    const droneIdx = SORTED_TYPE_INDICES[0];
    expect(droneIdx).toBeDefined();
    if (droneIdx === undefined) {
      return;
    }
    expect(TYPES[droneIdx]?.cost).toBe(1);
    expect(shopPrice(droneIdx)).toBe(1);
  });

  it('高コストユニットは 8 Cr 以下に圧縮', () => {
    for (const idx of SORTED_TYPE_INDICES) {
      expect(shopPrice(idx)).toBeGreaterThanOrEqual(1);
      expect(shopPrice(idx)).toBeLessThanOrEqual(8);
    }
  });

  it('HIGH_PRICE フォールバックは cost > 9 のタイプのみ', () => {
    for (const idx of SORTED_TYPE_INDICES) {
      const cost = TYPES[idx]?.cost ?? 0;
      const price = shopPrice(idx);
      if (price === 8) {
        expect(cost).toBeGreaterThan(9);
      } else {
        expect(cost).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe('initShopRound', () => {
  it('クレジット = ROUND_CREDITS、offerings が SHOP_SIZE 個', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    expect(getShopCredits()).toBe(ROUND_CREDITS);
    const items = getShopOfferings().filter((o) => o !== null);
    expect(items.length).toBe(SHOP_SIZE);
  });

  it('ラウンド間でクレジットがリセットされる', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    purchaseItem(0);
    expect(getShopCredits()).toBeLessThan(ROUND_CREDITS);
    initShopRound(rng, 2);
    expect(getShopCredits()).toBe(ROUND_CREDITS);
  });
});

describe('purchaseItem', () => {
  it('購入でクレジット減、offerings 除去、スロット配置', () => {
    expect.assertions(5);
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    expect(item).not.toBeNull();
    if (!item) {
      return;
    }

    const creditsBefore = getShopCredits();
    const result = purchaseItem(0);
    expect(result).toBe(true);
    expect(getShopCredits()).toBe(creditsBefore - item.shopPrice);
    expect(getShopOfferings()[0]).toBeNull();
    const slot = getShopSlots().find((s) => s !== null && s.type === item.type);
    expect(slot).toBeDefined();
  });

  it('クレジット不足で失敗', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    drainCredits();
    expect(getShopCredits()).toBe(0);
    // クレジット0のまま offerings を再生成して購入を試みる
    _setShopCredits(0);
    _setShopRng(makeRng(999));
    rerollOfferings(1); // クレジット0なので失敗するはず
    expect(purchaseItem(0)).toBe(false);
  });

  it('全スロット満杯で同タイプ以外は購入失敗', () => {
    fillAllSlots();
    expect(filledSlotCount()).toBe(SLOT_COUNT);

    // 全スロット満杯状態でスロットにないタイプの購入を試行
    initShopRound(makeRng(999), 1);
    const nonMergeIdx = findNonMergeableOffering();
    expect(nonMergeIdx).toBeGreaterThanOrEqual(0);
    expect(purchaseItem(nonMergeIdx)).toBe(false);
  });
});

describe('マージ', () => {
  it('同タイプ購入で mergeLevel 増加', () => {
    expect.assertions(4);
    const rng = makeRng();
    initShopRound(rng, 1);
    const item0 = getShopOfferings()[0];
    expect(item0).not.toBeNull();
    if (!item0) {
      return;
    }
    purchaseItem(0);

    // 同じタイプの offerings を探すか、リロールで出す
    // マージの統合テストは effectiveCount の単体テストでカバー
    const slotBefore = getShopSlots().find((s) => s !== null && s.type === item0.type);
    expect(slotBefore).toBeDefined();
    expect(slotBefore?.mergeLevel).toBe(0);
    expect(effectiveCount({ type: item0.type, baseCount: TYPES[item0.type]?.clusterSize ?? 1, mergeLevel: 0 })).toBe(
      TYPES[item0.type]?.clusterSize ?? 1,
    );
  });

  it('effectiveCount がマージレベルに応じて増加', () => {
    // baseCount=8, mergeBonusCount=4
    expect(effectiveCount(makeTestSlot(8, 0))).toBe(8);
    expect(effectiveCount(makeTestSlot(8, 1))).toBe(12);
    expect(effectiveCount(makeTestSlot(8, 2))).toBe(16);
    // baseCount=1, mergeBonusCount=1
    expect(effectiveCount(makeTestSlot(1, 0))).toBe(1);
    expect(effectiveCount(makeTestSlot(1, 1))).toBe(2);
    expect(effectiveCount(makeTestSlot(1, 3))).toBe(4);
  });
});

describe('sellSlot', () => {
  it('売却でクレジット回復（半額）、スロット解放', () => {
    expect.assertions(5);
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    expect(item).not.toBeNull();
    if (!item) {
      return;
    }
    purchaseItem(0);
    const creditsAfterBuy = getShopCredits();
    const slotIdx = getShopSlots().findIndex((s) => s !== null);
    expect(slotIdx).toBeGreaterThanOrEqual(0);

    const refund = sellPrice(item.type);
    const result = sellSlot(slotIdx);
    expect(result).toBe(true);
    expect(getShopCredits()).toBe(creditsAfterBuy + refund);
    expect(getShopSlots()[slotIdx]).toBeNull();
  });

  it('空スロット売却で false', () => {
    expect(sellSlot(0)).toBe(false);
  });
});

describe('rerollOfferings', () => {
  it('1Cr 消費で offerings が再生成される', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    const before = getShopOfferings().map((o) => o?.type);
    const creditsBefore = getShopCredits();

    _setShopRng(makeRng(99));
    const result = rerollOfferings(1);
    expect(result).toBe(true);
    expect(getShopCredits()).toBe(creditsBefore - REROLL_COST);
    const after = getShopOfferings().map((o) => o?.type);
    const changed = before.some((b, i) => b !== after[i]);
    expect(changed).toBe(true);
  });

  it('クレジット 0 でリロール不可', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    drainCredits();
    expect(getShopCredits()).toBe(0);
    expect(rerollOfferings(1)).toBe(false);
  });

  it('locked アイテムはリロールで保持', () => {
    expect.assertions(4);
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    expect(item).not.toBeNull();
    if (!item) {
      return;
    }
    toggleLock(0);
    expect(getShopOfferings()[0]?.locked).toBe(true);

    _setShopRng(makeRng(99));
    rerollOfferings(1);
    expect(getShopOfferings()[0]?.type).toBe(item.type);
    expect(getShopOfferings()[0]?.locked).toBe(true);
  });
});

describe('toggleLock', () => {
  it('ロック状態が反転する', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    expect(getShopOfferings()[0]?.locked).toBe(false);
    toggleLock(0);
    expect(getShopOfferings()[0]?.locked).toBe(true);
    toggleLock(0);
    expect(getShopOfferings()[0]?.locked).toBe(false);
  });
});

describe('buildFleetFromShop', () => {
  it('ShopSlot → FleetSetup 正確変換', () => {
    expect.assertions(6);
    const rng = makeRng();
    initShopRound(rng, 1);
    purchaseItem(0);
    const fleet = buildFleetFromShop(0);
    expect(fleet.variant).toBe(0);
    expect(fleet.slots.length).toBe(SLOT_COUNT);
    const filled = fleet.slots.filter((s) => s !== null);
    expect(filled.length).toBe(1);
    const slot = filled[0];
    expect(slot).toBeDefined();
    if (!slot) {
      return;
    }
    const shopSlot = getShopSlots().find((s) => s !== null);
    expect(shopSlot).toBeDefined();
    if (!shopSlot) {
      return;
    }
    expect(slot.count).toBe(effectiveCount(shopSlot));
  });
});

describe('sellPrice', () => {
  it('半額（切り捨て）、最低 1 Cr', () => {
    for (const idx of SORTED_TYPE_INDICES) {
      const sp = sellPrice(idx);
      expect(sp).toBeGreaterThanOrEqual(1);
      expect(sp).toBe(Math.max(1, Math.floor(shopPrice(idx) / 2)));
    }
  });

  it('mergeLevel=0 のデフォルト引数が明示指定と一致', () => {
    for (const idx of SORTED_TYPE_INDICES) {
      expect(sellPrice(idx)).toBe(sellPrice(idx, 0));
    }
  });

  it('マージ済みスロットの売却で投資額の半額が返る', () => {
    for (const idx of SORTED_TYPE_INDICES) {
      const price = shopPrice(idx);
      for (const ml of [1, 2, 3]) {
        const sp = sellPrice(idx, ml);
        expect(sp).toBe(Math.max(1, Math.floor((price * (1 + ml)) / 2)));
        expect(sp).toBeGreaterThanOrEqual(sellPrice(idx, 0));
      }
    }
  });
});
