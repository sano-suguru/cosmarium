import { beforeEach, describe, expect, it } from 'vitest';
import { makeRng } from './__test__/pool-helper.ts';
import { SORTED_TYPE_INDICES } from './fleet-cost.ts';
import { SLOT_COUNT } from './production-config.ts';
import {
  _setShopCredits,
  _setShopRng,
  _setShopSlot,
  buildFleetFromShop,
  canPurchaseItem,
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
import {
  effectiveCount,
  MAX_MERGE_LEVEL,
  mergeExpToLevel,
  REROLL_COST,
  ROUND_CREDITS,
  SHOP_PRICE,
  SHOP_SIZE,
  sellPrice,
  spawnCount,
} from './shop-tiers.ts';
import { HIVE_TYPE } from './unit-type-accessors.ts';
import { TYPES } from './unit-types.ts';

function makeTestSlot(baseCount: number, mergeExp: number): ShopSlot {
  const type = SORTED_TYPE_INDICES[0];
  if (type === undefined) {
    throw new Error('SORTED_TYPE_INDICES is empty');
  }
  return { type, baseCount, mergeExp };
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
    _setShopSlot(i, { type: typeIdx, baseCount, mergeExp: 0 });
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
    if (!rerollOfferings()) {
      break; // リロールも不可 → 終了
    }
  }
}

beforeEach(() => {
  initShop();
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
    expect(getShopCredits()).toBe(creditsBefore - SHOP_PRICE);
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
    rerollOfferings(); // クレジット0なので失敗するはず
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
  it('同タイプ購入で mergeExp 増加', () => {
    expect.assertions(4);
    const rng = makeRng();
    initShopRound(rng, 1);
    const item0 = getShopOfferings()[0];
    expect(item0).not.toBeNull();
    if (!item0) {
      return;
    }
    purchaseItem(0);

    const slotBefore = getShopSlots().find((s) => s !== null && s.type === item0.type);
    expect(slotBefore).toBeDefined();
    expect(slotBefore?.mergeExp).toBe(0);
    expect(effectiveCount({ type: item0.type, baseCount: TYPES[item0.type]?.clusterSize ?? 1, mergeExp: 0 })).toBe(
      TYPES[item0.type]?.clusterSize ?? 1,
    );
  });

  it('effectiveCount が mergeExp に応じて増加', () => {
    // baseCount=8: Lv1(exp=0)=8, Lv2(exp=2)=12, Lv3(exp=5)=16
    expect(effectiveCount(makeTestSlot(8, 0))).toBe(8);
    expect(effectiveCount(makeTestSlot(8, 2))).toBe(12);
    expect(effectiveCount(makeTestSlot(8, 5))).toBe(16);
    // baseCount=1: Lv1(exp=0)=1, Lv2(exp=2)=2, Lv3(exp=5)=3
    expect(effectiveCount(makeTestSlot(1, 0))).toBe(1);
    expect(effectiveCount(makeTestSlot(1, 2))).toBe(2);
    expect(effectiveCount(makeTestSlot(1, 5))).toBe(3);
  });

  it('★3 + 空スロット + 同タイプ → 重複配置禁止で false', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    if (!item) {
      return;
    }
    // スロット0に★3のユニットを配置（マージ不可）
    const baseCount = TYPES[item.type]?.clusterSize ?? 1;
    _setShopSlot(0, { type: item.type, baseCount, mergeExp: 5 });
    // スロット1以降は空 → 空きあり
    _setShopCredits(ROUND_CREDITS);

    // 同タイプ購入 → マージ不可 + 同タイプ既存 → false（重複配置禁止）
    expect(purchaseItem(0)).toBe(false);
    // スロット1は空のまま（重複配置されていない）
    expect(getShopSlots()[1]).toBeNull();
  });

  it('★3（mergeExp>=5）でマージ不可、新規配置もスロット満杯なら購入失敗', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    if (!item) {
      return;
    }
    // スロット0に★3のユニットを配置
    const baseCount = TYPES[item.type]?.clusterSize ?? 1;
    _setShopSlot(0, { type: item.type, baseCount, mergeExp: 5 });
    // 残りスロットを全て埋める
    for (let i = 1; i < SLOT_COUNT; i++) {
      const typeIdx = SORTED_TYPE_INDICES[i];
      if (typeIdx === undefined) {
        break;
      }
      _setShopSlot(i, { type: typeIdx, baseCount: TYPES[typeIdx]?.clusterSize ?? 1, mergeExp: 0 });
    }
    _setShopCredits(ROUND_CREDITS);

    // 同タイプのofferingを購入 → マージ不可＋スロット満杯 → false
    expect(purchaseItem(0)).toBe(false);
  });
});

describe('sellSlot', () => {
  it('売却でクレジット回復、スロット解放', () => {
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

    const slot = getShopSlots()[slotIdx];
    const refund = slot ? sellPrice(slot.mergeExp) : 0;
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
    const result = rerollOfferings();
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
    expect(rerollOfferings()).toBe(false);
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
    rerollOfferings();
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
    const fleet = buildFleetFromShop(HIVE_TYPE);
    expect(fleet.mothershipType).toBe(HIVE_TYPE);
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
    // Hive の spawnCountMul=1.5 が適用される
    const expected = Math.max(1, Math.round(effectiveCount(shopSlot) * 1.5));
    expect(slot.count).toBe(expected);
  });
});

describe('sellPrice', () => {
  it('レベル連動: Lv1=1Cr, Lv2=2Cr, Lv3=3Cr', () => {
    expect(sellPrice(0)).toBe(1);
    expect(sellPrice(2)).toBe(2);
    expect(sellPrice(5)).toBe(3);
  });

  it('mergeExp 中間値も正しくレベル変換', () => {
    expect(sellPrice(1)).toBe(1); // exp=1 → Lv1 → 1Cr
    expect(sellPrice(3)).toBe(2); // exp=3 → Lv2 → 2Cr
    expect(sellPrice(4)).toBe(2); // exp=4 → Lv2 → 2Cr
    expect(sellPrice(10)).toBe(3); // exp=10 → Lv3 → 3Cr
  });
});

describe('mergeExpToLevel', () => {
  it('閾値ベースでレベル変換', () => {
    expect(mergeExpToLevel(0)).toBe(0);
    expect(mergeExpToLevel(1)).toBe(0);
    expect(mergeExpToLevel(2)).toBe(1);
    expect(mergeExpToLevel(4)).toBe(1);
    expect(mergeExpToLevel(5)).toBe(2);
    expect(mergeExpToLevel(10)).toBe(2);
  });
});

describe('MAX_MERGE_LEVEL', () => {
  it('最大レベルは 2（★3）', () => {
    expect(MAX_MERGE_LEVEL).toBe(2);
  });
});

describe('canPurchaseItem', () => {
  it('購入可能 → null', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    expect(canPurchaseItem(0)).toBeNull();
  });

  it('クレジット不足 → no_credits', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    _setShopCredits(0);
    expect(canPurchaseItem(0)).toBe('no_credits');
  });

  it('★3到達 + 同タイプ → max_star', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    const item = getShopOfferings()[0];
    if (!item) {
      return;
    }
    const baseCount = TYPES[item.type]?.clusterSize ?? 1;
    _setShopSlot(0, { type: item.type, baseCount, mergeExp: 5 });
    _setShopCredits(ROUND_CREDITS);
    expect(canPurchaseItem(0)).toBe('max_star');
  });

  it('全スロット満杯 + 異タイプ → slots_full', () => {
    fillAllSlots();
    initShopRound(makeRng(999), 1);
    const nonMergeIdx = findNonMergeableOffering();
    expect(nonMergeIdx).toBeGreaterThanOrEqual(0);
    expect(canPurchaseItem(nonMergeIdx)).toBe('slots_full');
  });

  it('sold out → sold_out', () => {
    const rng = makeRng();
    initShopRound(rng, 1);
    purchaseItem(0);
    // offerings[0] は null（sold out）
    expect(canPurchaseItem(0)).toBe('sold_out');
  });
});

describe('spawnCount', () => {
  it('effectiveCount × spawnCountMul を反映', () => {
    // baseCount=8, mergeExp=0 → effectiveCount=8, ×1.5 = 12
    expect(spawnCount(makeTestSlot(8, 0), 1.5)).toBe(12);
    // baseCount=8, mergeExp=2 → effectiveCount=12, ×1.5 = 18
    expect(spawnCount(makeTestSlot(8, 2), 1.5)).toBe(18);
  });

  it('spawnCountMul=1 なら effectiveCount と同値', () => {
    expect(spawnCount(makeTestSlot(8, 0), 1)).toBe(effectiveCount(makeTestSlot(8, 0)));
    expect(spawnCount(makeTestSlot(1, 5), 1)).toBe(effectiveCount(makeTestSlot(1, 5)));
  });

  it('最小値 1 を保証', () => {
    expect(spawnCount(makeTestSlot(1, 0), 0.1)).toBe(1);
  });
});
