import { afterEach, describe, expect, it } from 'vitest';

import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { filledSlots, SLOT_COUNT } from '../production-config.ts';
import { mergeBonusCount, ROUND_CREDITS, shopPrice } from '../shop-tiers.ts';
import { rng } from '../state.ts';
import type { ProductionSlot } from '../types-fleet.ts';
import { TYPES } from '../unit-types.ts';
import { generateEnemySetup } from './enemy-fleet.ts';

afterEach(() => {
  resetPools();
  resetState();
});

function estimateFleetCost(slots: readonly (ProductionSlot | null)[]): number {
  let totalCost = 0;
  for (const slot of slots) {
    if (!slot) {
      continue;
    }
    totalCost += estimateSlotCost(slot);
  }
  return totalCost;
}

function estimateSlotCost(slot: ProductionSlot): number {
  const price = shopPrice(slot.type);
  const t = TYPES[slot.type];
  const baseCount = t?.clusterSize ?? 1;
  const bonus = mergeBonusCount(baseCount);
  const mergeLevel = baseCount > 0 ? Math.round((slot.count - baseCount) / bonus) : 0;
  return price * (1 + mergeLevel);
}

function countHighCostSlots(slots: readonly (ProductionSlot | null)[]): number {
  let count = 0;
  for (const slot of slots) {
    if (slot && shopPrice(slot.type) >= 6) {
      count++;
    }
  }
  return count;
}

describe('generateFixedNpc (via generateEnemySetup round 1-2)', () => {
  it('round=1 → 偵察隊（Drone のみ）', () => {
    const { setup, archetypeName } = generateEnemySetup(rng, 1);
    expect(archetypeName).toBe('偵察隊');
    const filled = filledSlots(setup.slots);
    expect(filled.length).toBe(1);
  });

  it('round=2 → 前衛部隊（Drone + Fighter）', () => {
    const { setup, archetypeName } = generateEnemySetup(rng, 2);
    expect(archetypeName).toBe('前衛部隊');
    const filled = filledSlots(setup.slots);
    expect(filled.length).toBe(2);
  });
});

describe('generateEnemySetup', () => {
  it('スロット数が SLOT_COUNT と一致する', () => {
    const { setup } = generateEnemySetup(rng, 1);
    expect(setup.slots.length).toBe(SLOT_COUNT);
  });

  it('バリアントが 0 | 1 | 2 の範囲', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 1);
      expect(setup.variant).toBeGreaterThanOrEqual(0);
      expect(setup.variant).toBeLessThanOrEqual(2);
    }
  });

  it('各スロットの type は cost > 0 のユニット', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 3);
      for (const slot of setup.slots) {
        if (slot) {
          const t = TYPES[slot.type];
          expect(t).toBeDefined();
          expect(t?.cost).toBeGreaterThan(0);
        }
      }
    }
  });

  it('各スロットの count が clusterSize 以上（マージで増加可能）', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 5);
      for (const slot of setup.slots) {
        if (slot) {
          const t = TYPES[slot.type];
          expect(slot.count).toBeGreaterThanOrEqual(t?.clusterSize ?? 1);
        }
      }
    }
  });

  it('アーキタイプ名が非空文字列', () => {
    for (let i = 0; i < 50; i++) {
      const { archetypeName } = generateEnemySetup(rng, 1);
      expect(archetypeName.length).toBeGreaterThan(0);
    }
  });

  it('50回ループでクラッシュしない', () => {
    for (let i = 0; i < 50; i++) {
      expect(() => generateEnemySetup(rng, i + 1)).not.toThrow();
    }
  });

  it('最低1つの non-null スロットが含まれる', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 3);
      const hasNonNull = filledSlots(setup.slots).length > 0;
      expect(hasNonNull).toBe(true);
    }
  });

  it('総shopPriceがROUND_CREDITS以下（予算制約準拠）', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 5);
      expect(estimateFleetCost(setup.slots)).toBeLessThanOrEqual(ROUND_CREDITS);
    }
  });

  it('スロット間で type の重複がない', () => {
    for (const round of [1, 5, 10]) {
      for (let i = 0; i < 50; i++) {
        const { setup } = generateEnemySetup(rng, round);
        const filled = filledSlots(setup.slots);
        const types = filled.map((s) => s.type);
        expect(new Set(types).size).toBe(types.length);
      }
    }
  });

  it('ラウンドが進むと高コストユニットが出現しやすい', () => {
    let earlyHighCost = 0;
    let lateHighCost = 0;
    const runs = 100;

    for (let i = 0; i < runs; i++) {
      earlyHighCost += countHighCostSlots(generateEnemySetup(rng, 1).setup.slots);
      lateHighCost += countHighCostSlots(generateEnemySetup(rng, 10).setup.slots);
    }
    expect(lateHighCost).toBeGreaterThan(earlyHighCost);
  });
});
