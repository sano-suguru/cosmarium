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

// ─── Kill Tracking ───────────────────────────────────────────────

export function createKillTracker(): KillTracker {
  const size = TYPES.length;
  const killMatrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    killMatrix.push(new Array(size).fill(0));
  }
  return {
    teamKills: new Array(MAX_TEAMS).fill(0),
    killsByType: new Array(size).fill(0),
    deathsByType: new Array(size).fill(0),
    killMatrix,
  };
}

export function installKillHook(tracker: KillTracker): () => void {
  return onKillUnit((e) => {
    const prev = tracker.deathsByType[e.victimType] as number;
    tracker.deathsByType[e.victimType] = prev + 1;
    if (e.killer !== NO_UNIT && e.killerType !== undefined && e.killerTeam !== undefined) {
      const kPrev = tracker.killsByType[e.killerType] as number;
      tracker.killsByType[e.killerType] = kPrev + 1;
      const tPrev = tracker.teamKills[e.killerTeam] as number;
      tracker.teamKills[e.killerTeam] = tPrev + 1;
      // Kill Matrix
      const row = tracker.killMatrix[e.killerType];
      if (row) {
        const mPrev = row[e.victimType] as number;
        row[e.victimType] = mPrev + 1;
      }
    }
  });
}

// ─── Damage Tracking ─────────────────────────────────────────────

export function createDamageTracker(): DamageTracker {
  const size = TYPES.length;
  return {
    dealtByType: new Array(size).fill(0),
    receivedByType: new Array(size).fill(0),
  };
}

export function installDamageHook(tracker: DamageTracker): () => void {
  return onDamageUnit((e) => {
    const dPrev = tracker.dealtByType[e.attackerType] as number;
    tracker.dealtByType[e.attackerType] = dPrev + e.amount;
    const rPrev = tracker.receivedByType[e.victimType] as number;
    tracker.receivedByType[e.victimType] = rPrev + e.amount;
  });
}

// ─── Support Tracking ────────────────────────────────────────────

export function createSupportTracker(): SupportTracker {
  const size = TYPES.length;
  return {
    healingByType: new Array(size).fill(0),
    ampApplications: new Array(size).fill(0),
    scrambleApplications: new Array(size).fill(0),
    catalystApplications: new Array(size).fill(0),
  };
}

export function installSupportHook(tracker: SupportTracker): () => void {
  return onSupportEffect((e) => {
    switch (e.kind) {
      case 'heal': {
        const prev = tracker.healingByType[e.casterType] as number;
        tracker.healingByType[e.casterType] = prev + e.amount;
        break;
      }
      case 'amp': {
        const prev = tracker.ampApplications[e.casterType] as number;
        tracker.ampApplications[e.casterType] = prev + e.amount;
        break;
      }
      case 'scramble': {
        const prev = tracker.scrambleApplications[e.casterType] as number;
        tracker.scrambleApplications[e.casterType] = prev + e.amount;
        break;
      }
      case 'catalyst': {
        const prev = tracker.catalystApplications[e.casterType] as number;
        tracker.catalystApplications[e.casterType] = prev + e.amount;
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
    totalLifespan: new Array(size).fill(0),
    spawnTimes: new Map(),
  };
}

export function installLifespanKillHook(tracker: LifespanTracker): () => void {
  return onKillUnit((e) => {
    const spawnTime = tracker.spawnTimes.get(e.victim) ?? 0;
    const lifespan = getCurrentSimTime() - spawnTime;
    const prev = tracker.totalLifespan[e.victimType] as number;
    tracker.totalLifespan[e.victimType] = prev + lifespan;
    tracker.spawnTimes.delete(e.victim);
  });
}

// ─── Kill Context Tracking ──────────────────────────────────────

export function createKillContextTracker(): KillContextTracker {
  const size = TYPES.length;
  const contextCounts: number[][] = [];
  for (let i = 0; i < size; i++) {
    contextCounts.push(new Array(KILL_CONTEXT_COUNT).fill(0));
  }
  return { contextCounts };
}

export function installKillContextHook(tracker: KillContextTracker): () => void {
  return onKillUnit((e) => {
    const row = tracker.contextCounts[e.victimType];
    if (row) {
      const prev = row[e.killContext] as number;
      row[e.killContext] = prev + 1;
    }
  });
}

// ─── Cross-Trial Aggregation ────────────────────────────────────

export function aggregateLifespan(trials: readonly TrialResult[]): Map<number, number> {
  const totalLifespan = new Map<number, number>();
  for (const trial of trials) {
    const ls = trial.lifespanStats;
    for (let i = 0; i < ls.totalLifespan.length; i++) {
      const v = ls.totalLifespan[i] as number;
      if (v > 0) {
        totalLifespan.set(i, (totalLifespan.get(i) ?? 0) + v);
      }
    }
  }
  return totalLifespan;
}

function addContextRow(agg: number[], row: readonly number[]) {
  for (let j = 0; j < KILL_CONTEXT_COUNT; j++) {
    const v = row[j];
    if (v) {
      (agg[j] as number) += v;
    }
  }
}

export function aggregateKillContext(trials: readonly TrialResult[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const trial of trials) {
    const cc = trial.killContextStats.contextCounts;
    for (let i = 0; i < cc.length; i++) {
      const row = cc[i];
      if (!row) {
        continue;
      }
      let agg = result.get(i);
      if (!agg) {
        agg = new Array(KILL_CONTEXT_COUNT).fill(0);
        result.set(i, agg);
      }
      addContextRow(agg, row);
    }
  }
  return result;
}

// ─── Unit Stats Collection ───────────────────────────────────────

export function collectUnitStats(
  spawnedByType: number[],
  survivorsByType: number[],
  tracker: KillTracker,
): UnitTypeStats[] {
  const unitStats: UnitTypeStats[] = [];
  for (let i = 0; i < TYPES.length; i++) {
    const spawned = spawnedByType[i] as number;
    const kills = tracker.killsByType[i] as number;
    const deaths = tracker.deathsByType[i] as number;
    const survived = survivorsByType[i] as number;
    if (spawned > 0 || kills > 0 || deaths > 0) {
      unitStats.push({ typeIndex: i, name: typeName(i), spawned, kills, deaths, survived });
    }
  }
  return unitStats;
}
