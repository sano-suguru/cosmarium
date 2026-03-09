/**
 * バッチ対戦システム — トラッカー生成・フック登録ロジック
 */

import { onDamageUnit, onSupportEffect } from '../simulation/hooks.ts';
import { KILL_CONTEXT_COUNT } from '../simulation/on-kill-effects.ts';
import { onKillUnit, onSpawnUnit } from '../simulation/spawn.ts';
import { MAX_TEAMS, NO_UNIT } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import type {
  DamageTracker,
  KillContextTracker,
  KillSequenceTracker,
  KillTracker,
  LifespanTracker,
  SupportTracker,
  TrialResult,
  UnitTypeStats,
} from './batch-types.ts';
import { typeName } from './batch-types.ts';

// ─── TypedArray Helpers (noUncheckedIndexedAccess 対策) ─────────

function at(arr: Int32Array | Float64Array, idx: number): number {
  return arr[idx] ?? 0;
}

function accum(arr: Int32Array | Float64Array, idx: number, delta: number): void {
  arr[idx] = (arr[idx] ?? 0) + delta;
}

// ─── Tracking Hooks ──────────────────────────────────────────────

export function createKillTracker(): KillTracker {
  const size = TYPES.length;
  const killMatrix: Int32Array[] = [];
  for (let i = 0; i < size; i++) {
    killMatrix.push(new Int32Array(size));
  }
  return {
    teamKills: new Int32Array(MAX_TEAMS),
    killsByType: new Int32Array(size),
    deathsByType: new Int32Array(size),
    killMatrix,
  };
}

export function installKillHook(tracker: KillTracker): () => void {
  return onKillUnit((e) => {
    accum(tracker.deathsByType, e.victimType, 1);
    if (e.killer !== NO_UNIT && e.killerType !== undefined && e.killerTeam !== undefined) {
      accum(tracker.killsByType, e.killerType, 1);
      accum(tracker.teamKills, e.killerTeam, 1);
      const row = tracker.killMatrix[e.killerType];
      if (row) {
        accum(row, e.victimType, 1);
      }
    }
  });
}

export function createDamageTracker(): DamageTracker {
  const size = TYPES.length;
  return {
    dealtByType: new Float64Array(size),
    receivedByType: new Float64Array(size),
  };
}

/** タイプ別の攻撃力/被弾量を全チーム横断で集計するダメージフックを登録 */
export function installDamageHook(tracker: DamageTracker): () => void {
  return onDamageUnit((e) => {
    accum(tracker.dealtByType, e.attackerType, e.amount);
    accum(tracker.receivedByType, e.victimType, e.amount);
  });
}

export function createSupportTracker(): SupportTracker {
  const size = TYPES.length;
  return {
    healingByType: new Float64Array(size),
    ampApplications: new Float64Array(size),
    scrambleApplications: new Float64Array(size),
    catalystApplications: new Float64Array(size),
  };
}

export function installSupportHook(tracker: SupportTracker): () => void {
  return onSupportEffect((e) => {
    switch (e.kind) {
      case 'heal': {
        accum(tracker.healingByType, e.casterType, e.amount);
        break;
      }
      case 'amp': {
        accum(tracker.ampApplications, e.casterType, e.amount);
        break;
      }
      case 'scramble': {
        accum(tracker.scrambleApplications, e.casterType, e.amount);
        break;
      }
      case 'catalyst': {
        accum(tracker.catalystApplications, e.casterType, e.amount);
        break;
      }
    }
  });
}

// ─── Snapshot Tracking ───────────────────────────────────────────

/** エントロピー計算に十分な精度を持つキルシーケンスの上限長 */
const MAX_KILL_SEQUENCE_LENGTH = 10800;

export function createKillSequenceTracker(maxLength: number = MAX_KILL_SEQUENCE_LENGTH): KillSequenceTracker {
  return { sequence: [], maxLength };
}

export function installKillSequenceHook(tracker: KillSequenceTracker): () => void {
  return onKillUnit((e) => {
    if (tracker.sequence.length >= tracker.maxLength) {
      return;
    }
    tracker.sequence.push(e.victimType);
  });
}

export function createLifespanTracker(): LifespanTracker {
  const size = TYPES.length;
  return {
    totalLifespan: new Float64Array(size),
    spawnTimes: new Map(),
  };
}

/** 全 spawn をタイプ別にカウントするフック。Carrier 等による戦闘中 spawn も含む */
function installSpawnCountHook(): { spawnedByType: Int32Array; unsubscribe: () => void } {
  const spawnedByType = new Int32Array(TYPES.length);
  const unsubscribe = onSpawnUnit((e) => {
    accum(spawnedByType, e.type, 1);
  });
  return { spawnedByType, unsubscribe };
}

export function installLifespanSpawnHook(tracker: LifespanTracker, getTime: () => number): () => void {
  return onSpawnUnit((e) => {
    tracker.spawnTimes.set(e.unitIndex, getTime());
  });
}

export function installLifespanKillHook(tracker: LifespanTracker, getTime: () => number): () => void {
  return onKillUnit((e) => {
    const spawnTime = tracker.spawnTimes.get(e.victim) ?? 0;
    const lifespan = getTime() - spawnTime;
    accum(tracker.totalLifespan, e.victimType, lifespan);
    tracker.spawnTimes.delete(e.victim);
  });
}

export function createKillContextTracker(): KillContextTracker {
  const size = TYPES.length;
  const contextCounts: Int32Array[] = [];
  for (let i = 0; i < size; i++) {
    contextCounts.push(new Int32Array(KILL_CONTEXT_COUNT));
  }
  return { contextCounts };
}

export function installKillContextHook(tracker: KillContextTracker): () => void {
  return onKillUnit((e) => {
    const row = tracker.contextCounts[e.victimType];
    if (row) {
      accum(row, e.killContext, 1);
    }
  });
}

/** 全トラッカーを一括生成・フック登録し、まとめて解除できるオブジェクトを返す */
export function installAllTrackers(getCurrentTime: () => number) {
  const kill = createKillTracker();
  const unsubKill = installKillHook(kill);
  const damage = createDamageTracker();
  const unsubDmg = installDamageHook(damage);
  const support = createSupportTracker();
  const unsubSup = installSupportHook(support);
  const sequence = createKillSequenceTracker();
  const unsubSeq = installKillSequenceHook(sequence);
  const lifespan = createLifespanTracker();
  const unsubLifespanSpawn = installLifespanSpawnHook(lifespan, getCurrentTime);
  const unsubLifespanKill = installLifespanKillHook(lifespan, getCurrentTime);
  const killContext = createKillContextTracker();
  const unsubCtx = installKillContextHook(killContext);
  const { spawnedByType, unsubscribe: unsubSpawnCount } = installSpawnCountHook();

  function unsubscribeAll() {
    unsubKill();
    unsubDmg();
    unsubSup();
    unsubSeq();
    unsubLifespanSpawn();
    unsubLifespanKill();
    unsubCtx();
    unsubSpawnCount();
  }

  return { kill, damage, support, sequence, lifespan, killContext, spawnedByType, unsubscribeAll };
}

// ─── Cross-Trial Aggregation ────────────────────────────────────

export function aggregateLifespan(trials: readonly TrialResult[]): Map<number, number> {
  const totalLifespan = new Map<number, number>();
  for (const trial of trials) {
    const ls = trial.lifespanStats;
    for (let i = 0; i < ls.totalLifespan.length; i++) {
      const v = at(ls.totalLifespan, i);
      if (v > 0) {
        totalLifespan.set(i, (totalLifespan.get(i) ?? 0) + v);
      }
    }
  }
  return totalLifespan;
}

function addContextRow(agg: Int32Array, row: Int32Array) {
  for (let j = 0; j < KILL_CONTEXT_COUNT; j++) {
    accum(agg, j, at(row, j));
  }
}

export function aggregateKillContext(trials: readonly TrialResult[]): Map<number, Int32Array> {
  const result = new Map<number, Int32Array>();
  for (const trial of trials) {
    const cc = trial.killContextStats.contextCounts;
    for (let i = 0; i < cc.length; i++) {
      const row = cc[i];
      if (!row) {
        continue;
      }
      let agg = result.get(i);
      if (!agg) {
        agg = new Int32Array(KILL_CONTEXT_COUNT);
        result.set(i, agg);
      }
      addContextRow(agg, row);
    }
  }
  return result;
}

export function collectUnitStats(
  spawnedByType: Int32Array,
  survivorsByType: Int32Array,
  tracker: KillTracker,
): UnitTypeStats[] {
  const unitStats: UnitTypeStats[] = [];
  for (let i = 0; i < TYPES.length; i++) {
    const spawned = at(spawnedByType, i);
    const kills = at(tracker.killsByType, i);
    const deaths = at(tracker.deathsByType, i);
    const survived = at(survivorsByType, i);
    if (spawned > 0 || kills > 0 || deaths > 0) {
      unitStats.push({ typeIndex: i, name: typeName(i), spawned, kills, deaths, survived });
    }
  }
  return unitStats;
}
