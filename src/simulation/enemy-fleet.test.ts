import { afterEach, describe, expect, it } from 'vitest';

import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { filledSlots, SLOT_COUNT } from '../production-config.ts';
import { rng } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { generateEnemySetup } from './enemy-fleet.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('generateEnemySetup', () => {
  it('スロット数が SLOT_COUNT と一致する', () => {
    const { setup } = generateEnemySetup(rng);
    expect(setup.slots.length).toBe(SLOT_COUNT);
  });

  it('バリアントが 0 | 1 | 2 の範囲', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng);
      expect(setup.variant).toBeGreaterThanOrEqual(0);
      expect(setup.variant).toBeLessThanOrEqual(2);
    }
  });

  it('各スロットの type は cost > 0 のユニット', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng);
      for (const slot of setup.slots) {
        if (slot) {
          const t = TYPES[slot.type];
          expect(t).toBeDefined();
          expect(t?.cost).toBeGreaterThan(0);
        }
      }
    }
  });

  it('各スロットの count がそのユニットの clusterSize と一致', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng);
      for (const slot of setup.slots) {
        if (slot) {
          const t = TYPES[slot.type];
          expect(slot.count).toBe(t?.clusterSize);
        }
      }
    }
  });

  it('アーキタイプ名が非空文字列', () => {
    for (let i = 0; i < 50; i++) {
      const { archetypeName } = generateEnemySetup(rng);
      expect(archetypeName.length).toBeGreaterThan(0);
    }
  });

  it('スロット間で type の重複がない（非復元抽出）', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng);
      const filled = filledSlots(setup.slots);
      const types = filled.map((s) => s.type);
      const unique = new Set(types);
      expect(unique.size).toBe(types.length);
    }
  });

  it('50回ループでクラッシュしない', () => {
    for (let i = 0; i < 50; i++) {
      expect(() => generateEnemySetup(rng)).not.toThrow();
    }
  });

  it('最低1つの non-null スロットが含まれる', () => {
    for (let i = 0; i < 50; i++) {
      const { setup } = generateEnemySetup(rng);
      const hasNonNull = filledSlots(setup.slots).length > 0;
      expect(hasNonNull).toBe(true);
    }
  });
});
