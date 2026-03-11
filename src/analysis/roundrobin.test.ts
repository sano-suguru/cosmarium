import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { seedRng, state } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { runRoundRobin } from './roundrobin.ts';

function testCreateRng(seed: number): () => number {
  seedRng(seed);
  return state.rng;
}

afterEach(() => {
  resetPools();
  resetState();
});

describe('runRoundRobin', () => {
  it('少数ユニットタイプでラウンドロビンを実行する', () => {
    // コスト上限を非常に小さくして高コストユニットが参加できないようにし、対戦数を減らす
    const summary = runRoundRobin({
      costCap: 3,
      trials: 2,
      seed: 42,
      maxSteps: 300,
      outFile: null,
      createRng: testCreateRng,
      logger: () => undefined,
    });

    // cost <= 3 のユニットのみ実際に対戦可能（costCap=3 で1体以上購入できるもの）
    const eligibleCount = TYPES.filter((t) => t.cost > 0 && t.cost <= 3).length;
    const expectedMatchups = (eligibleCount * (eligibleCount - 1)) / 2;
    // 対戦は両方のユニットが購入可能なペアのみ
    expect(summary.matchups.length).toBe(expectedMatchups);
    expect(summary.rankings.length).toBe(eligibleCount);

    for (const m of summary.matchups) {
      expect(m.winsA + m.winsB + m.draws).toBe(2);
      expect(m.trials).toBe(2);
    }

    for (const r of summary.rankings) {
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.totalMatches).toBeGreaterThan(0);
      expect(r.name).toBeTruthy();
    }
  });

  it('ランキングが勝率降順でソートされている', () => {
    const summary = runRoundRobin({
      costCap: 3,
      trials: 2,
      seed: 99,
      maxSteps: 300,
      outFile: null,
      createRng: testCreateRng,
      logger: () => undefined,
    });

    for (let i = 1; i < summary.rankings.length; i++) {
      const prev = summary.rankings[i - 1];
      const curr = summary.rankings[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev && curr) {
        expect(prev.winRate).toBeGreaterThanOrEqual(curr.winRate);
      }
    }
  });

  it('相性リストが正しく分類される', () => {
    const summary = runRoundRobin({
      costCap: 3,
      trials: 4,
      seed: 42,
      maxSteps: 300,
      outFile: null,
      createRng: testCreateRng,
      logger: () => undefined,
    });

    for (const r of summary.rankings) {
      // strongAgainst と weakAgainst は重複しない
      for (const s of r.strongAgainst) {
        expect(r.weakAgainst).not.toContain(s);
      }
    }
  });
});
