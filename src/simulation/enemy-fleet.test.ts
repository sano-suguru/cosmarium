import { afterEach, describe, expect, it } from 'vitest';

import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { getMothershipDef, MOTHERSHIP_DEFS } from '../mothership-defs.ts';
import { filledSlots, SLOT_COUNT } from '../production-config.ts';
import type { ShopSlot } from '../shop-tiers.ts';
import { MAX_MERGE_LEVEL, mergeExpToLevel, ROUND_CREDITS, SHOP_PRICE } from '../shop-tiers.ts';
import { rng } from '../state.ts';
import type { ProductionSlot } from '../types-fleet.ts';
import { unitTypeCost } from '../unit-type-accessors.ts';
import { TYPES } from '../unit-types.ts';
import { generateEnemySetup } from './enemy-fleet.ts';
import type { FleetProfile } from './enemy-fleet-profile.ts';
import { profileFleet } from './enemy-fleet-profile.ts';

afterEach(() => {
  resetPools();
  resetState();
});

function estimateFleetCost(botSlots: readonly (ShopSlot | null)[] | null): number {
  if (!botSlots) {
    return 0;
  }
  let total = 0;
  for (const s of botSlots) {
    if (s) {
      total += SHOP_PRICE * (1 + s.mergeExp);
    }
  }
  return total;
}

function assertMergeLevelsWithinLimit(botSlots: readonly (ShopSlot | null)[] | null): void {
  if (!botSlots) {
    return;
  }
  for (const s of botSlots) {
    if (s) {
      expect(mergeExpToLevel(s.mergeExp)).toBeLessThanOrEqual(MAX_MERGE_LEVEL);
    }
  }
}

function countHighCostSlots(slots: readonly (ProductionSlot | null)[]): number {
  let count = 0;
  for (const slot of slots) {
    if (slot && unitTypeCost(slot.type) >= 8) {
      count++;
    }
  }
  return count;
}

describe('generateFixedNpc (via generateEnemySetup round 1-2)', () => {
  it('round=1 → 偵察隊（Drone のみ）、botSlots=null', () => {
    const { setup, archetypeName, botSlots } = generateEnemySetup(rng, 1);
    expect(archetypeName).toBe('偵察隊');
    expect(botSlots).toBeNull();
    const filled = filledSlots(setup.slots);
    expect(filled.length).toBe(1);
  });

  it('round=2 → 前衛部隊（Drone + Fighter）、botSlots=null', () => {
    const { setup, archetypeName, botSlots } = generateEnemySetup(rng, 2);
    expect(archetypeName).toBe('前衛部隊');
    expect(botSlots).toBeNull();
    const filled = filledSlots(setup.slots);
    expect(filled.length).toBe(2);
  });
});

describe('generateEnemySetup', () => {
  it('スロット数が SLOT_COUNT と一致する', () => {
    const { setup } = generateEnemySetup(rng, 1);
    expect(setup.slots.length).toBe(SLOT_COUNT);
  });

  it('mothershipType が有効な母艦タイプの UnitTypeIndex', () => {
    const validTypes = new Set(MOTHERSHIP_DEFS.map((d) => d.type));
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 1);
      expect(validTypes.has(setup.mothershipType)).toBe(true);
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

  it('各スロットの count が spawnCountMul 適用後の最小値以上', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng, 5);
      const spawnMul = getMothershipDef(setup.mothershipType).spawnCountMul;
      for (const slot of setup.slots) {
        if (slot) {
          const t = TYPES[slot.type];
          const minCount = Math.max(1, Math.round((t?.clusterSize ?? 1) * spawnMul));
          expect(slot.count).toBeGreaterThanOrEqual(minCount);
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

  it('総購入コストがROUND_CREDITS+母艦ボーナス以下（予算制約準拠）', () => {
    for (let i = 0; i < 50; i++) {
      const { setup, botSlots } = generateEnemySetup(rng, 5);
      const msCredits = getMothershipDef(setup.mothershipType).creditsPerRound;
      expect(estimateFleetCost(botSlots)).toBeLessThanOrEqual(ROUND_CREDITS + msCredits);
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

  it.each([3, 5, 10])('botSlots の全スロットが MAX_MERGE_LEVEL を超えない (round=%i)', (round) => {
    for (let i = 0; i < 50; i++) {
      const { botSlots } = generateEnemySetup(rng, round);
      assertMergeLevelsWithinLimit(botSlots);
    }
  });

  it('botSlots から profileFleet で FleetProfile を取得できる', () => {
    const { botSlots } = generateEnemySetup(rng, 5);
    if (!botSlots) {
      throw new Error('round>=3 must have botSlots');
    }
    const profile: FleetProfile = profileFleet(botSlots);
    expect(profile.total).toBeGreaterThanOrEqual(0);
    expect(profile.roles.attack + profile.roles.support + profile.roles.special).toBeLessThanOrEqual(profile.total);
  });
});
