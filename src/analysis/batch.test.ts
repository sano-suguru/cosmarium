import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { seedRng, state } from '../state.ts';
import type { FleetComposition } from '../types.ts';
import { runBatch } from './batch.ts';
import type { BatchConfig } from './batch-types.ts';

function testCreateRng(seed: number): () => number {
  seedRng(seed);
  return state.rng;
}

function makeTestConfig(overrides?: Partial<BatchConfig>): BatchConfig {
  return {
    trials: 2,
    mode: 'battle',
    teams: 2,
    seed: 42,
    budget: 80,
    maxSteps: 600,
    snapshotInterval: 300,
    outFile: null,
    createRng: testCreateRng,
    logger: () => undefined,
    ...overrides,
  };
}

afterEach(() => {
  resetPools();
  resetState();
});

describe('runBatch', () => {
  it('battle モードで指定回数の試合を実行する', () => {
    const summary = runBatch(makeTestConfig({ seed: 99, budget: 50, maxSteps: 300, snapshotInterval: 60 }));

    expect(summary.trials).toHaveLength(2);
    expect(summary.config.trials).toBe(2);
    expect(summary.stats.avgSteps).toBeGreaterThan(0);

    for (const trial of summary.trials) {
      expect(trial.snapshots.length).toBeGreaterThan(0);
      expect(trial.steps).toBeGreaterThan(0);
      expect(trial.steps).toBeLessThanOrEqual(300);
    }
  });

  it('melee モードで N 勢力対戦を実行する', () => {
    const summary = runBatch(
      makeTestConfig({ trials: 1, mode: 'melee', teams: 3, budget: 50, maxSteps: 300, snapshotInterval: 60 }),
    );

    expect(summary.trials).toHaveLength(1);
    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    expect(trial?.snapshots.length).toBeGreaterThan(0);
  });

  it('異なるシードで異なる結果を生む', () => {
    const run = (seed: number) => runBatch(makeTestConfig({ trials: 1, seed, budget: 50, maxSteps: 300 }));

    const a = run(1);
    const b = run(99999);

    const snapshotA = a.trials[0]?.snapshots[0];
    const snapshotB = b.trials[0]?.snapshots[0];
    // 空間エントロピーが完全に一致する確率は極めて低い
    expect(snapshotA?.spatial).not.toBe(snapshotB?.spatial);
  });

  it('スナップショットに有効なエントロピー値が含まれる', () => {
    const summary = runBatch(makeTestConfig({ trials: 1, seed: 12345, maxSteps: 120, snapshotInterval: 30 }));

    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    for (const snap of trial?.snapshots ?? []) {
      expect(snap.spatial).toBeGreaterThanOrEqual(0);
      expect(snap.spatial).toBeLessThanOrEqual(1);
      expect(snap.positionRle).toBeGreaterThanOrEqual(0);
      expect(snap.positionRle).toBeLessThanOrEqual(1);
      expect(snap.teamCounts.length).toBe(2);
    }
  });

  it('艦隊構成が記録される', () => {
    const summary = runBatch(makeTestConfig({ trials: 1, budget: 50, maxSteps: 300 }));

    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    expect(trial?.fleetCompositions).toHaveLength(2);
    for (const fleet of trial?.fleetCompositions ?? []) {
      expect(fleet.length).toBeGreaterThan(0);
      for (const entry of fleet) {
        expect(entry.count).toBeGreaterThan(0);
      }
    }
  });

  it('ユニットタイプ別戦績が集計される', () => {
    const summary = runBatch(makeTestConfig());

    expect(summary.unitSummary.length).toBeGreaterThan(0);
    for (const us of summary.unitSummary) {
      expect(us.totalSpawned).toBeGreaterThanOrEqual(0);
      expect(us.totalKills).toBeGreaterThanOrEqual(0);
      expect(us.totalDeaths).toBeGreaterThanOrEqual(0);
      expect(us.kd).toBeGreaterThanOrEqual(0);
      expect(us.name).toBeTruthy();
      expect(us.winDelta).toBeGreaterThanOrEqual(-1);
      expect(us.winDelta).toBeLessThanOrEqual(1);
    }
  });

  it('スナップショットにチームキル数が含まれる', () => {
    const summary = runBatch(makeTestConfig({ trials: 1, snapshotInterval: 60 }));

    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    const lastSnap = trial?.snapshots[trial.snapshots.length - 1];
    expect(lastSnap?.teamKills).toBeDefined();
    expect(lastSnap?.teamKills.length).toBe(2);
  });

  it('指定艦隊で対戦できる', () => {
    const fleet0: FleetComposition = [{ type: 0, count: 10 }];
    const fleet1: FleetComposition = [{ type: 1, count: 5 }];

    const summary = runBatch(makeTestConfig({ trials: 1, budget: 200, maxSteps: 300, fleets: [fleet0, fleet1] }));

    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    expect(trial?.fleetCompositions[0]).toEqual(fleet0);
    expect(trial?.fleetCompositions[1]).toEqual(fleet1);
  });

  it('生存統計が記録される', () => {
    const summary = runBatch(makeTestConfig());

    expect(summary.unitSummary.length).toBeGreaterThan(0);
    for (const us of summary.unitSummary) {
      expect(us.totalSurvived).toBeGreaterThanOrEqual(0);
      expect(us.totalSurvived).toBeLessThanOrEqual(us.totalSpawned);
      expect(us.survivalRate).toBeGreaterThanOrEqual(0);
      expect(us.survivalRate).toBeLessThanOrEqual(1);
    }

    for (const trial of summary.trials) {
      for (const us of trial.unitStats) {
        expect(us.survived).toBeGreaterThanOrEqual(0);
        expect(us.survived).toBeLessThanOrEqual(us.spawned);
      }
    }
  });

  it('コスト効率メトリクスが計算される', () => {
    const summary = runBatch(makeTestConfig());

    expect(summary.unitSummary.length).toBeGreaterThan(0);
    for (const us of summary.unitSummary) {
      expect(us.cost).toBeGreaterThanOrEqual(0);
      expect(us.killsPerCost).toBeGreaterThanOrEqual(0);
      // cost=0 (Mothership) の場合は killsPerCost=0
      if (us.cost === 0) {
        expect(us.killsPerCost).toBe(0);
      }
    }
  });

  it('キルマトリクスが集計される', () => {
    const summary = runBatch(makeTestConfig());

    expect(summary.killMatrix).toBeDefined();
    expect(summary.killMatrix.data.length).toBe(summary.killMatrix.size);

    for (const trial of summary.trials) {
      expect(trial.killMatrix).toBeDefined();
      expect(trial.killMatrix.data.length).toBe(trial.killMatrix.size);
    }

    for (const us of summary.unitSummary) {
      if (us.totalKills > 0) {
        expect(us.topVictimType).not.toBeNull();
      }
    }
  });

  it('ダメージ統計が集計される', () => {
    const summary = runBatch(makeTestConfig());

    for (const trial of summary.trials) {
      expect(trial.damageStats).toBeDefined();
      expect(trial.damageStats.dealtByType.length).toBeGreaterThan(0);
      expect(trial.damageStats.receivedByType.length).toBeGreaterThan(0);
    }

    for (const us of summary.unitSummary) {
      expect(us.totalDamageDealt).toBeGreaterThanOrEqual(0);
      expect(us.totalDamageReceived).toBeGreaterThanOrEqual(0);
      expect(us.damagePerCost).toBeGreaterThanOrEqual(0);
    }

    const totalDealt = summary.unitSummary.reduce((s, u) => s + u.totalDamageDealt, 0);
    expect(totalDealt).toBeGreaterThan(0);
  });

  it('サポート統計が集計される', () => {
    const summary = runBatch(makeTestConfig());

    for (const trial of summary.trials) {
      expect(trial.supportStats).toBeDefined();
      expect(trial.supportStats.healingByType.length).toBeGreaterThan(0);
      expect(trial.supportStats.ampApplications.length).toBeGreaterThan(0);
      expect(trial.supportStats.scrambleApplications.length).toBeGreaterThan(0);
      expect(trial.supportStats.catalystApplications.length).toBeGreaterThan(0);
    }

    for (const us of summary.unitSummary) {
      expect(us.totalHealing).toBeGreaterThanOrEqual(0);
      expect(us.supportScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('キルシーケンスエントロピーが計算される', () => {
    const summary = runBatch(makeTestConfig());

    for (const trial of summary.trials) {
      expect(trial.killSequenceEntropy).toBeGreaterThanOrEqual(0);
    }

    expect(summary.stats.avgKillSequenceEntropy).toBeGreaterThanOrEqual(0);
  });

  it('生存時間分布が計算される', () => {
    const summary = runBatch(makeTestConfig());

    for (const trial of summary.trials) {
      expect(trial.lifespanStats).toBeDefined();
      expect(trial.lifespanStats.totalLifespan.length).toBeGreaterThan(0);
    }

    for (const us of summary.unitSummary) {
      expect(us.avgLifespan).toBeGreaterThanOrEqual(0);
    }
  });

  it('死因内訳が記録される', () => {
    const summary = runBatch(makeTestConfig());

    for (const trial of summary.trials) {
      expect(trial.killContextStats).toBeDefined();
      expect(trial.killContextStats.contextCounts.length).toBeGreaterThan(0);
    }

    for (const us of summary.unitSummary) {
      expect(us.deathsByContext).toBeDefined();
      expect(us.deathsByContext.length).toBe(6);
      for (const c of us.deathsByContext) {
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('シナジーペアが計算される', () => {
    const summary = runBatch(makeTestConfig({ trials: 10, snapshotInterval: 600 }));

    expect(summary.synergyPairs).toBeDefined();
    expect(Array.isArray(summary.synergyPairs)).toBe(true);

    for (const sp of summary.synergyPairs) {
      expect(sp.coWinRate).toBeGreaterThanOrEqual(0);
      expect(sp.coWinRate).toBeLessThanOrEqual(1);
      expect(sp.coCount).toBeGreaterThanOrEqual(5);
      expect(sp.nameA).toBeTruthy();
      expect(sp.nameB).toBeTruthy();
    }
  });
});
