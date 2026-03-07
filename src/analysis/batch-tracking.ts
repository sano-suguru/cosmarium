/**
 * バッチ対戦システム — トラッカー生成・フック登録ロジック
 */

import { getCurrentSimTime, onDamageUnit, onSupportEffect } from '../simulation/hooks.ts';
import { KILL_CONTEXT_COUNT } from '../simulation/on-kill-effects.ts';
import { onKillUnit } from '../simulation/spawn.ts';
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

// ─── Kill Tracking ───────────────────────────────────────────────

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

// ─── Damage Tracking ─────────────────────────────────────────────

export function createDamageTracker(): DamageTracker {
  const size = TYPES.length;
  return {
    dealtByType: new Float64Array(size),
    receivedByType: new Float64Array(size),
  };
}

export function installDamageHook(tracker: DamageTracker): () => void {
  return onDamageUnit((e) => {
    accum(tracker.dealtByType, e.attackerType, e.amount);
    accum(tracker.receivedByType, e.victimType, e.amount);
  });
}

// ─── Support Tracking ────────────────────────────────────────────

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

// ─── Kill Sequence Tracking ──────────────────────────────────────

export function createKillSequenceTracker(): KillSequenceTracker {
  return { sequence: [] };
}

export function installKillSequenceHook(tracker: KillSequenceTracker): () => void {
  return onKillUnit((e) => {
    tracker.sequence.push(e.victimType);
  });
}

// ─── Lifespan Tracking ──────────────────────────────────────────

export function createLifespanTracker(): LifespanTracker {
  const size = TYPES.length;
  return {
    totalLifespan: new Float64Array(size),
    spawnTimes: new Map(),
  };
}

export function installLifespanKillHook(tracker: LifespanTracker): () => void {
  return onKillUnit((e) => {
    const spawnTime = tracker.spawnTimes.get(e.victim) ?? 0;
    const lifespan = getCurrentSimTime() - spawnTime;
    accum(tracker.totalLifespan, e.victimType, lifespan);
    tracker.spawnTimes.delete(e.victim);
  });
}

// ─── Kill Context Tracking ──────────────────────────────────────

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

// ─── Unit Stats Collection ───────────────────────────────────────

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
