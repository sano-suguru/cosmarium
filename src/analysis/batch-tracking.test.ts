import { afterEach, describe, expect, it } from 'vitest';
import { asType, kill, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { emitDamage, emitSupport } from '../simulation/hooks.ts';
import { KILL_CONTEXT } from '../simulation/on-kill-effects.ts';
import type { Team } from '../team.ts';
import {
  aggregateKillContext,
  aggregateLifespan,
  collectUnitStats,
  createDamageTracker,
  createKillContextTracker,
  createKillSequenceTracker,
  createKillTracker,
  createLifespanTracker,
  createSupportTracker,
  installDamageHook,
  installKillContextHook,
  installKillHook,
  installKillSequenceHook,
  installLifespanKillHook,
  installLifespanSpawnHook,
  installSupportHook,
} from './batch-tracking.ts';
import type { TrialResult } from './batch-types.ts';

afterEach(() => {
  resetPools();
  resetState();
});

const T0: Team = 0;
const T1: Team = 1;
const TYPE_A = asType(0);
const TYPE_B = asType(1);

describe('KillTracker', () => {
  it('キルイベントで killsByType/deathsByType/teamKills/killMatrix を正しく集計する', () => {
    const tracker = createKillTracker();
    installKillHook(tracker);

    const attacker = spawnAt(T0, TYPE_A, 0, 0);
    const victim = spawnAt(T1, TYPE_B, 10, 0);

    kill(victim, { index: attacker, team: T0, type: TYPE_A });

    expect(tracker.killsByType[TYPE_A]).toBe(1);
    expect(tracker.deathsByType[TYPE_B]).toBe(1);
    expect(tracker.teamKills[T0]).toBe(1);
    expect(tracker.teamKills[T1]).toBe(0);
    expect(tracker.killMatrix[TYPE_A]?.[TYPE_B]).toBe(1);
    expect(tracker.killMatrix[TYPE_A]?.[TYPE_A]).toBe(0);
  });

  it('複数キルを累積する', () => {
    const tracker = createKillTracker();
    installKillHook(tracker);

    const a = spawnAt(T0, TYPE_A, 0, 0);
    const v1 = spawnAt(T1, TYPE_B, 10, 0);
    const v2 = spawnAt(T1, TYPE_B, 20, 0);

    kill(v1, { index: a, team: T0, type: TYPE_A });
    kill(v2, { index: a, team: T0, type: TYPE_A });

    expect(tracker.killsByType[TYPE_A]).toBe(2);
    expect(tracker.deathsByType[TYPE_B]).toBe(2);
    expect(tracker.teamKills[T0]).toBe(2);
  });
});

describe('DamageTracker', () => {
  it('ダメージイベントで dealtByType/receivedByType を集計する', () => {
    const tracker = createDamageTracker();
    installDamageHook(tracker);

    emitDamage(TYPE_A, T0, TYPE_B, T1, 25.5, 'direct');
    emitDamage(TYPE_A, T0, TYPE_B, T1, 10, 'aoe');

    expect(tracker.dealtByType[TYPE_A]).toBeCloseTo(35.5);
    expect(tracker.receivedByType[TYPE_B]).toBeCloseTo(35.5);
    expect(tracker.dealtByType[TYPE_B]).toBe(0);
    expect(tracker.receivedByType[TYPE_A]).toBe(0);
  });
});

describe('SupportTracker', () => {
  it('heal イベントを healingByType に集計する', () => {
    const tracker = createSupportTracker();
    installSupportHook(tracker);

    emitSupport(TYPE_A, T0, TYPE_B, T0, 'heal', 30);

    expect(tracker.healingByType[TYPE_A]).toBeCloseTo(30);
  });

  it('amp イベントを ampApplications に集計する', () => {
    const tracker = createSupportTracker();
    installSupportHook(tracker);

    emitSupport(TYPE_A, T0, TYPE_B, T0, 'amp', 5);

    expect(tracker.ampApplications[TYPE_A]).toBeCloseTo(5);
  });

  it('scramble イベントを scrambleApplications に集計する', () => {
    const tracker = createSupportTracker();
    installSupportHook(tracker);

    emitSupport(TYPE_B, T0, TYPE_A, T0, 'scramble', 3);

    expect(tracker.scrambleApplications[TYPE_B]).toBeCloseTo(3);
  });

  it('catalyst イベントを catalystApplications に集計する', () => {
    const tracker = createSupportTracker();
    installSupportHook(tracker);

    emitSupport(TYPE_A, T0, TYPE_B, T0, 'catalyst', 7);

    expect(tracker.catalystApplications[TYPE_A]).toBeCloseTo(7);
  });
});

describe('LifespanTracker', () => {
  it('spawn → kill で生存時間を記録する', () => {
    let time = 0;
    const getTime = () => time;
    const tracker = createLifespanTracker();
    installLifespanSpawnHook(tracker, getTime);
    installLifespanKillHook(tracker, getTime);

    time = 0;
    const u = spawnAt(T0, TYPE_A, 0, 0);

    time = 10;
    kill(u);

    expect(tracker.totalLifespan[TYPE_A]).toBeCloseTo(10);
  });

  it('増援ユニット: spawn 時刻からの差分を使う（全体経過時間ではない）', () => {
    let time = 0;
    const getTime = () => time;
    const tracker = createLifespanTracker();
    installLifespanSpawnHook(tracker, getTime);
    installLifespanKillHook(tracker, getTime);

    // 増援: time=5 にスポーン
    time = 5;
    const u = spawnAt(T0, TYPE_A, 0, 0);

    // time=15 にキル → lifespan = 15 - 5 = 10
    time = 15;
    kill(u);

    expect(tracker.totalLifespan[TYPE_A]).toBeCloseTo(10);
  });

  it('複数ユニットの生存時間を累積する', () => {
    let time = 0;
    const getTime = () => time;
    const tracker = createLifespanTracker();
    installLifespanSpawnHook(tracker, getTime);
    installLifespanKillHook(tracker, getTime);

    time = 0;
    const u1 = spawnAt(T0, TYPE_A, 0, 0);
    const u2 = spawnAt(T0, TYPE_A, 10, 0);

    time = 5;
    kill(u1); // lifespan = 5

    time = 20;
    kill(u2); // lifespan = 20

    expect(tracker.totalLifespan[TYPE_A]).toBeCloseTo(25);
  });
});

describe('KillContextTracker', () => {
  it('キルコンテキスト別にカウントする', () => {
    const tracker = createKillContextTracker();
    installKillContextHook(tracker);

    const a = spawnAt(T0, TYPE_A, 0, 0);
    const v1 = spawnAt(T1, TYPE_B, 10, 0);
    const v2 = spawnAt(T1, TYPE_B, 20, 0);
    const v3 = spawnAt(T1, TYPE_B, 30, 0);

    kill(v1, { index: a, team: T0, type: TYPE_A }, KILL_CONTEXT.ProjectileDirect);
    kill(v2, { index: a, team: T0, type: TYPE_A }, KILL_CONTEXT.Beam);
    kill(v3, { index: a, team: T0, type: TYPE_A }, KILL_CONTEXT.Ram);

    const row = tracker.contextCounts[TYPE_B];
    expect(row?.[KILL_CONTEXT.ProjectileDirect]).toBe(1);
    expect(row?.[KILL_CONTEXT.Beam]).toBe(1);
    expect(row?.[KILL_CONTEXT.Ram]).toBe(1);
    expect(row?.[KILL_CONTEXT.ProjectileAoe]).toBe(0);
  });
});

describe('KillSequenceTracker', () => {
  it('キル順にvictimTypeを記録する', () => {
    const tracker = createKillSequenceTracker();
    installKillSequenceHook(tracker);

    const a = spawnAt(T0, TYPE_A, 0, 0);
    const v1 = spawnAt(T1, TYPE_A, 10, 0);
    const v2 = spawnAt(T1, TYPE_B, 20, 0);
    const v3 = spawnAt(T1, TYPE_A, 30, 0);

    kill(v1, { index: a, team: T0, type: TYPE_A });
    kill(v2, { index: a, team: T0, type: TYPE_A });
    kill(v3, { index: a, team: T0, type: TYPE_A });

    expect(tracker.sequence).toEqual([TYPE_A, TYPE_B, TYPE_A]);
  });
});

describe('collectUnitStats', () => {
  it('spawned/kills/deaths/survived を正しく集計する', () => {
    const tracker = createKillTracker();
    installKillHook(tracker);

    const a = spawnAt(T0, TYPE_A, 0, 0);
    const v1 = spawnAt(T1, TYPE_B, 10, 0);
    spawnAt(T1, TYPE_B, 20, 0); // survivor

    kill(v1, { index: a, team: T0, type: TYPE_A });

    const spawnedByType = new Int32Array(2);
    spawnedByType[0] = 1; // TYPE_A
    spawnedByType[1] = 2; // TYPE_B

    const survivorsByType = new Int32Array(2);
    survivorsByType[0] = 1; // TYPE_A survived
    survivorsByType[1] = 1; // TYPE_B: 1 survived, 1 died

    const stats = collectUnitStats(spawnedByType, survivorsByType, tracker);

    const statA = stats.find((s) => s.typeIndex === TYPE_A);
    const statB = stats.find((s) => s.typeIndex === TYPE_B);

    expect(statA).toBeDefined();
    expect(statA?.spawned).toBe(1);
    expect(statA?.kills).toBe(1);
    expect(statA?.deaths).toBe(0);
    expect(statA?.survived).toBe(1);

    expect(statB).toBeDefined();
    expect(statB?.spawned).toBe(2);
    expect(statB?.kills).toBe(0);
    expect(statB?.deaths).toBe(1);
    expect(statB?.survived).toBe(1);
  });

  it('spawned/kills/deaths がすべて 0 のタイプは結果に含めない', () => {
    const tracker = createKillTracker();
    const spawnedByType = new Int32Array(10);
    const survivorsByType = new Int32Array(10);

    const stats = collectUnitStats(spawnedByType, survivorsByType, tracker);
    expect(stats).toHaveLength(0);
  });
});

describe('aggregateLifespan', () => {
  it('複数トライアルの lifespan を合算する', () => {
    const lifespan1 = new Float64Array(3);
    lifespan1[0] = 100;
    lifespan1[1] = 50;

    const lifespan2 = new Float64Array(3);
    lifespan2[0] = 200;
    lifespan2[2] = 75;

    const trials = [
      { lifespanStats: { totalLifespan: lifespan1 } },
      { lifespanStats: { totalLifespan: lifespan2 } },
    ] as unknown as TrialResult[];

    const result = aggregateLifespan(trials);

    expect(result.get(0)).toBe(300);
    expect(result.get(1)).toBe(50);
    expect(result.get(2)).toBe(75);
  });

  it('空のトライアル配列では空の Map を返す', () => {
    const result = aggregateLifespan([]);
    expect(result.size).toBe(0);
  });
});

describe('aggregateKillContext', () => {
  it('複数トライアルの killContext を合算する', () => {
    const row1a = new Int32Array(9);
    row1a[KILL_CONTEXT.ProjectileDirect] = 3;
    row1a[KILL_CONTEXT.Beam] = 1;
    const row1b = new Int32Array(9);
    row1b[KILL_CONTEXT.Ram] = 2;
    const ctx1: Int32Array[] = [row1a, row1b];

    const row2a = new Int32Array(9);
    row2a[KILL_CONTEXT.ProjectileDirect] = 5;
    const row2b = new Int32Array(9);
    row2b[KILL_CONTEXT.Ram] = 4;
    const ctx2: Int32Array[] = [row2a, row2b];

    const trials = [
      { killContextStats: { contextCounts: ctx1 } },
      { killContextStats: { contextCounts: ctx2 } },
    ] as unknown as TrialResult[];

    const result = aggregateKillContext(trials);

    const row0 = result.get(0);
    expect(row0?.[KILL_CONTEXT.ProjectileDirect]).toBe(8);
    expect(row0?.[KILL_CONTEXT.Beam]).toBe(1);

    const row1 = result.get(1);
    expect(row1?.[KILL_CONTEXT.Ram]).toBe(6);
  });

  it('空のトライアル配列では空の Map を返す', () => {
    const result = aggregateKillContext([]);
    expect(result.size).toBe(0);
  });
});

describe('NO_UNIT killer edge case', () => {
  it('killer なしでも deathsByType を記録する', () => {
    const tracker = createKillTracker();
    installKillHook(tracker);

    const v = spawnAt(T1, TYPE_B, 10, 0);
    kill(v); // killer=undefined → NO_UNIT

    expect(tracker.deathsByType[TYPE_B]).toBe(1);
    expect(tracker.killsByType[TYPE_A]).toBe(0);
    expect(tracker.killsByType[TYPE_B]).toBe(0);
    expect(tracker.teamKills[T0]).toBe(0);
    expect(tracker.teamKills[T1]).toBe(0);
  });
});
