import { afterEach, describe, expect, it } from 'vitest';

import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { DEFAULT_BUDGET } from '../fleet-cost.ts';
import { rng } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { generateEnemyFleet } from './enemy-fleet.ts';

afterEach(() => {
  resetPools();
  resetState();
});

function fleetCost(fleet: readonly { type: number; count: number }[]): number {
  let sum = 0;
  for (const e of fleet) sum += (TYPES[e.type]?.cost ?? 0) * e.count;
  return sum;
}

describe('generateEnemyFleet', () => {
  it('never returns an empty fleet', () => {
    for (let i = 0; i < 50; i++) {
      const { fleet } = generateEnemyFleet(DEFAULT_BUDGET, rng);
      expect(fleet.length).toBeGreaterThan(0);
    }
  });

  it('stays within budget', () => {
    for (let i = 0; i < 50; i++) {
      const { fleet } = generateEnemyFleet(DEFAULT_BUDGET, rng);
      expect(fleetCost(fleet)).toBeLessThanOrEqual(DEFAULT_BUDGET);
    }
  });

  it('every entry has a positive count', () => {
    for (let i = 0; i < 50; i++) {
      const { fleet } = generateEnemyFleet(DEFAULT_BUDGET, rng);
      for (const e of fleet) {
        expect(e.count).toBeGreaterThan(0);
      }
    }
  });

  it('returns a non-empty archetype name', () => {
    const { archetypeName } = generateEnemyFleet(DEFAULT_BUDGET, rng);
    expect(archetypeName.length).toBeGreaterThan(0);
  });

  it('uses most of the budget', () => {
    let totalUsed = 0;
    const runs = 50;
    for (let i = 0; i < runs; i++) {
      const { fleet } = generateEnemyFleet(DEFAULT_BUDGET, rng);
      totalUsed += fleetCost(fleet);
    }
    const avgUsed = totalUsed / runs;
    expect(avgUsed).toBeGreaterThan(DEFAULT_BUDGET * 0.7);
  });

  it('works with a minimal budget', () => {
    const { fleet } = generateEnemyFleet(1, rng);
    expect(fleet.length).toBeGreaterThan(0);
  });
});
