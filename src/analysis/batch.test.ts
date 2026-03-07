import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { runBatch } from './batch.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('runBatch', () => {
  it('battle モードで指定回数の試合を実行する', () => {
    const summary = runBatch({
      trials: 2,
      mode: 'battle',
      teams: 2,
      seed: 99,
      budget: 50,
      maxSteps: 300,
      snapshotInterval: 60,
      outFile: null,
    });

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
    const summary = runBatch({
      trials: 1,
      mode: 'melee',
      teams: 3,
      seed: 42,
      budget: 50,
      maxSteps: 300,
      snapshotInterval: 60,
      outFile: null,
    });

    expect(summary.trials).toHaveLength(1);
    const trial = summary.trials[0];
    expect(trial).toBeDefined();
    expect(trial?.snapshots.length).toBeGreaterThan(0);
  });

  it('異なるシードで異なる結果を生む', () => {
    const run = (seed: number) =>
      runBatch({
        trials: 1,
        mode: 'battle',
        teams: 2,
        seed,
        budget: 50,
        maxSteps: 300,
        snapshotInterval: 300,
        outFile: null,
      });

    const a = run(1);
    const b = run(99999);

    const snapshotA = a.trials[0]?.snapshots[0];
    const snapshotB = b.trials[0]?.snapshots[0];
    // 空間エントロピーが完全に一致する確率は極めて低い
    expect(snapshotA?.spatial).not.toBe(snapshotB?.spatial);
  });

  it('スナップショットに有効なエントロピー値が含まれる', () => {
    const summary = runBatch({
      trials: 1,
      mode: 'battle',
      teams: 2,
      seed: 12345,
      budget: 80,
      maxSteps: 120,
      snapshotInterval: 30,
      outFile: null,
    });

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
});
