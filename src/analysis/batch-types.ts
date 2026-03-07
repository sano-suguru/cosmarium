/**
 * バッチ対戦システム — 型定義
 */

import type { FleetComposition } from '../types.ts';
import { TYPES } from '../unit-types.ts';

export function typeName(idx: number): string {
  return TYPES[idx]?.name ?? `Type${idx}`;
}

// ─── Config ──────────────────────────────────────────────────────

export interface BatchConfig {
  readonly trials: number;
  readonly mode: 'battle' | 'melee';
  readonly teams: number;
  readonly seed: number;
  readonly budget: number;
  readonly maxSteps: number;
  readonly snapshotInterval: number;
  readonly outFile: string | null;
  /** 指定時はランダム生成の代わりにこの構成を使用。teams 分の配列 */
  readonly fleets?: readonly FleetComposition[] | undefined;
  /** シード値から RNG 関数を生成するファクトリ */
  readonly createRng: (seed: number) => () => number;
  /** 進捗ログ出力関数。デフォルトは console.error */
  readonly logger?: ((msg: string) => void) | undefined;
}

// ─── Trial ───────────────────────────────────────────────────────

export interface TrialSnapshot {
  readonly step: number;
  readonly elapsed: number;
  readonly teamCounts: Int32Array;
  readonly teamKills: Int32Array;
  readonly spatial: number;
  readonly positionRle: number;
}

/** ユニットタイプ別の累積キル/デス/生存 */
export interface UnitTypeStats {
  readonly typeIndex: number;
  readonly name: string;
  readonly spawned: number;
  readonly kills: number;
  readonly deaths: number;
  readonly survived: number;
}

export interface TrialResult {
  readonly trialIndex: number;
  readonly seed: number;
  readonly winner: number | 'draw' | null;
  readonly steps: number;
  readonly elapsed: number;
  readonly fleetDiversities: readonly number[];
  readonly fleetCompositions: readonly FleetComposition[];
  readonly snapshots: readonly TrialSnapshot[];
  readonly complexity: number;
  readonly unitStats: readonly UnitTypeStats[];
  readonly killMatrix: KillMatrix;
  readonly damageStats: DamageTracker;
  readonly supportStats: SupportTracker;
  readonly killSequenceEntropy: number;
  readonly killContextStats: KillContextTracker;
  readonly lifespanStats: LifespanStats;
}

// ─── Summary ─────────────────────────────────────────────────────

export interface UnitTypeSummary {
  readonly typeIndex: number;
  readonly name: string;
  readonly totalSpawned: number;
  readonly totalKills: number;
  readonly totalDeaths: number;
  readonly totalSurvived: number;
  readonly survivalRate: number;
  readonly kd: number;
  readonly cost: number;
  readonly killsPerCost: number;
  /** この型を含む艦隊の勝率 */
  readonly winRateWhenPresent: number;
  /** この型を含まない艦隊の勝率（比較用） */
  readonly winRateWhenAbsent: number;
  /** 勝率貢献度 (winRateWhenPresent - winRateWhenAbsent) */
  readonly winDelta: number;
  /** 最も多く倒したユニットタイプ */
  readonly topVictimType: number | null;
  /** 最も多く倒されたユニットタイプ */
  readonly topThreatType: number | null;
  /** 総ダメージ量 */
  readonly totalDamageDealt: number;
  /** 総被ダメージ量 */
  readonly totalDamageReceived: number;
  /** コスト対ダメージ効率 */
  readonly damagePerCost: number;
  /** 総回復量 */
  readonly totalHealing: number;
  /** サポートスコア (回復 + バフ適用数) */
  readonly supportScore: number;
  /** 平均生存時間（秒） */
  readonly avgLifespan: number;
  /** 死因別カウント [Direct, AoE, Beam, Ram, Chain, Sweep] */
  readonly deathsByContext: Int32Array;
}

export interface BatchSummary {
  readonly config: BatchConfig;
  readonly trials: readonly TrialResult[];
  readonly stats: {
    readonly avgSteps: number;
    readonly avgComplexity: number;
    readonly winRates: Record<string, number>;
    readonly avgSpatialEntropy: number;
    readonly avgKillSequenceEntropy: number;
  };
  readonly unitSummary: readonly UnitTypeSummary[];
  readonly killMatrix: KillMatrix;
  readonly synergyPairs: readonly SynergyPair[];
}

// ─── Kill Matrix ─────────────────────────────────────────────────

export interface KillMatrix {
  /** matrix[killerType][victimType] = count */
  readonly data: Int32Array[];
  readonly size: number;
}

// ─── Kill Tracking ───────────────────────────────────────────────

export interface KillTracker {
  readonly teamKills: Int32Array;
  readonly killsByType: Int32Array;
  readonly deathsByType: Int32Array;
  readonly killMatrix: Int32Array[];
}

// ─── Damage Tracking ─────────────────────────────────────────────

export interface DamageTracker {
  readonly dealtByType: Float64Array;
  readonly receivedByType: Float64Array;
}

// ─── Support Tracking ────────────────────────────────────────────

export interface SupportTracker {
  readonly healingByType: Float64Array;
  readonly ampApplications: Float64Array;
  readonly scrambleApplications: Float64Array;
  readonly catalystApplications: Float64Array;
}

// ─── Kill Sequence Tracking ─────────────────────────────────────

export interface KillSequenceTracker {
  readonly sequence: number[];
}

// ─── Lifespan Tracking ──────────────────────────────────────────

export interface LifespanTracker {
  readonly totalLifespan: Float64Array;
  readonly spawnTimes: Map<number, number>;
}

export interface LifespanStats {
  readonly totalLifespan: Float64Array;
}

// ─── Kill Context Tracking ──────────────────────────────────────

export interface KillContextTracker {
  readonly contextCounts: Int32Array[];
}

// ─── Synergy ────────────────────────────────────────────────────

export interface SynergyPair {
  readonly typeA: number;
  readonly typeB: number;
  readonly nameA: string;
  readonly nameB: string;
  readonly coWinRate: number;
  readonly soloAWinRate: number;
  readonly soloBWinRate: number;
  /** coWinRate - max(soloA, soloB) */
  readonly synergy: number;
  readonly coCount: number;
}
