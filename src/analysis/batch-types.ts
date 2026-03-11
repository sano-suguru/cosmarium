/**
 * バッチ対戦システム — 型定義
 */

import type { UnitTypeIndex } from '../types.ts';
import type { FleetComposition } from '../types-fleet.ts';
import { TYPES } from '../unit-types.ts';

export function typeName(idx: number): string {
  return TYPES[idx]?.name ?? `Type${idx}`;
}

export interface BatchConfig {
  readonly trials: number;
  readonly mode: 'battle' | 'melee';
  readonly teams: number;
  readonly seed: number;
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

/** Worker にシリアライズ可能な BatchConfig サブセット（関数フィールド createRng / logger を除外） */
export type SerializableBatchConfig = Omit<BatchConfig, 'createRng' | 'logger'>;

export interface WorkerMessage {
  readonly trialIndex: number;
  readonly config: SerializableBatchConfig;
}

export interface WorkerResult {
  readonly result: SerializedTrialResult;
}

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

export interface KillMatrix {
  /** matrix[killerType][victimType] = count */
  readonly data: Int32Array[];
  readonly size: number;
}

export interface KillTracker {
  readonly teamKills: Int32Array;
  readonly killsByType: Int32Array;
  readonly deathsByType: Int32Array;
  readonly killMatrix: Int32Array[];
}

export interface DamageTracker {
  readonly dealtByType: Float64Array;
  readonly receivedByType: Float64Array;
}

export interface SupportTracker {
  readonly healingByType: Float64Array;
  readonly ampApplications: Float64Array;
  readonly scrambleApplications: Float64Array;
  readonly catalystApplications: Float64Array;
}

export interface KillSequenceTracker {
  readonly sequence: number[];
  readonly maxLength: number;
}

export interface LifespanTracker {
  readonly totalLifespan: Float64Array;
  readonly spawnTimes: Map<number, number>;
}

export interface LifespanStats {
  readonly totalLifespan: Float64Array;
}

export interface KillContextTracker {
  readonly contextCounts: Int32Array[];
}

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

// ─── RoundRobin Types ───────────────────────────────────────────

export interface MatchupResult {
  readonly typeA: UnitTypeIndex;
  readonly typeB: UnitTypeIndex;
  readonly nameA: string;
  readonly nameB: string;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  readonly trials: number;
}

export interface RoundRobinRanking {
  readonly typeIndex: UnitTypeIndex;
  readonly name: string;
  readonly totalWins: number;
  readonly totalLosses: number;
  readonly totalDraws: number;
  readonly totalMatches: number;
  readonly winRate: number;
  readonly strongAgainst: readonly string[];
  readonly weakAgainst: readonly string[];
}

export interface RoundRobinSummary {
  readonly costCap: number;
  readonly trialsPerMatchup: number;
  readonly seed: number;
  readonly matchups: readonly MatchupResult[];
  readonly rankings: readonly RoundRobinRanking[];
}

export interface RoundRobinConfig {
  readonly costCap: number;
  readonly trials: number;
  readonly seed: number;
  readonly maxSteps: number;
  readonly outFile: string | null;
  readonly createRng: (seed: number) => () => number;
  /** 進捗ログ出力関数。デフォルトは console.error */
  readonly logger?: ((msg: string) => void) | undefined;
}

// ─── Worker TypedArray シリアライズ ──────────────────────────────

/** 2D Int32Array を structured clone 安全な形式に平坦化した表現 */
interface FlatMatrix {
  readonly flat: Int32Array;
  readonly rows: number;
  readonly cols: number;
}

function flattenMatrix(arrays: Int32Array[], rows: number, cols: number): FlatMatrix {
  const flat = new Int32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const row = arrays[r];
    if (row) {
      flat.set(row, r * cols);
    }
  }
  return { flat, rows, cols };
}

function unflattenMatrix(fm: FlatMatrix): Int32Array[] {
  const result: Int32Array[] = [];
  for (let r = 0; r < fm.rows; r++) {
    result.push(fm.flat.slice(r * fm.cols, (r + 1) * fm.cols));
  }
  return result;
}

/** Worker postMessage 用にシリアライズされた TrialResult（2D TypedArray → FlatMatrix） */
export interface SerializedTrialResult extends Omit<TrialResult, 'killMatrix' | 'killContextStats'> {
  readonly killMatrix: { readonly data: FlatMatrix; readonly size: number };
  readonly killContextStats: { readonly contextCounts: FlatMatrix };
}

export function serializeTrialResult(r: TrialResult): SerializedTrialResult {
  const kmSize = r.killMatrix.size;
  const ctxRows = r.killContextStats.contextCounts.length;
  const firstCtxRow = r.killContextStats.contextCounts[0];
  const ctxCols = ctxRows > 0 && firstCtxRow ? firstCtxRow.length : 0;
  return {
    ...r,
    killMatrix: { data: flattenMatrix(r.killMatrix.data, kmSize, kmSize), size: kmSize },
    killContextStats: { contextCounts: flattenMatrix(r.killContextStats.contextCounts, ctxRows, ctxCols) },
  };
}

export function deserializeTrialResult(s: SerializedTrialResult): TrialResult {
  return {
    ...s,
    killMatrix: { data: unflattenMatrix(s.killMatrix.data), size: s.killMatrix.size },
    killContextStats: { contextCounts: unflattenMatrix(s.killContextStats.contextCounts) },
  };
}
