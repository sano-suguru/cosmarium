import { describe, expect, it } from 'vitest';
import { asType } from './__test__/pool-helper.ts';
import { countFleetUnits, SORTED_TYPE_INDICES } from './fleet-cost.ts';
import { TYPES } from './unit-types.ts';

describe('TYPES[i].cost', () => {
  it('every unit type has a non-negative integer cost', () => {
    for (const t of TYPES) {
      expect(t.cost).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(t.cost)).toBe(true);
    }
  });

  it('purchasable unit types have positive cost', () => {
    for (const i of SORTED_TYPE_INDICES) {
      expect(TYPES[i]?.cost).toBeGreaterThan(0);
    }
  });
});

describe('countFleetUnits', () => {
  it('sums all entry counts', () => {
    const fleet = [
      { type: asType(0), count: 5 },
      { type: asType(1), count: 3 },
      { type: asType(2), count: 7 },
    ];
    expect(countFleetUnits(fleet)).toBe(15);
  });

  it('returns 0 for empty fleet', () => {
    expect(countFleetUnits([])).toBe(0);
  });
});

describe('SORTED_TYPE_INDICES', () => {
  it('contains every purchasable type index exactly once', () => {
    const sorted = [...SORTED_TYPE_INDICES].sort((a, b) => a - b);
    const expected = TYPES.map((_, i) => i).filter((i) => (TYPES[i]?.cost ?? 0) > 0);
    expect(sorted).toEqual(expected);
  });

  it('is sorted by cost ascending', () => {
    for (let i = 1; i < SORTED_TYPE_INDICES.length; i++) {
      const prev = TYPES[SORTED_TYPE_INDICES[i - 1] ?? 0]?.cost ?? 0;
      const curr = TYPES[SORTED_TYPE_INDICES[i] ?? 0]?.cost ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
