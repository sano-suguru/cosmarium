/**
 * entropy.ts — 戦闘複雑性スコア算出
 */

import { lzComplexity, rleCompressionRatio } from './entropy.ts';

// ─── Battle State Complexity ───────────────────────────────────────

export interface BattleStateSnapshot {
  /** チームごとの生存ユニット数 */
  readonly teamCounts: Int32Array;
  /** チームごとの累計キル数 */
  readonly teamKills: Int32Array;
  /** ユニットの空間エントロピー */
  readonly spatialEntropy: number;
}

/**
 * 戦闘状態のスナップショット系列から「戦闘複雑性スコア」を算出。
 *
 * - 空間エントロピーの変動幅（陣形の動的変化）
 * - ユニット数変化の LZ 複雑性（戦況の予測困難性）
 * - チーム間キル差の変動（拮抗度）
 *
 * を統合して 0～1 のスコアを返す。
 */
export function battleComplexity(snapshots: readonly BattleStateSnapshot[]): number {
  if (snapshots.length < 2) {
    return 0;
  }

  const spatialDynamics = spatialEntropyVolatility(snapshots);
  const countPredictability = unitCountComplexity(snapshots);
  const killBalance = killDiffCompression(snapshots);

  /**
   * 戦闘複雑性スコアの成分重み。
   * - 空間動態 30%: 陣形変化は戦闘の一側面だが、停滞したまま激戦になるケースもある
   * - ユニット数 40%: 戦況の推移を最も直接的に反映。最大重み
   * - キル差変動 30%: 拮抗度を示すが、一方的でも複雑な戦闘はあり得る
   */
  const W_SPATIAL = 0.3;
  const W_UNIT_COUNT = 0.4;
  const W_KILL_BALANCE = 0.3;

  return spatialDynamics * W_SPATIAL + countPredictability * W_UNIT_COUNT + killBalance * W_KILL_BALANCE;
}

function spatialEntropyVolatility(snapshots: readonly BattleStateSnapshot[]): number {
  const spatials = snapshots.map((s) => s.spatialEntropy);
  return Math.min(1, standardDeviation(spatials) * 2);
}

function unitCountComplexity(snapshots: readonly BattleStateSnapshot[]): number {
  const totalCounts = snapshots.map((s) => {
    let sum = 0;
    for (const c of s.teamCounts) {
      sum += c;
    }
    return sum;
  });
  return lzComplexity(totalCounts);
}

function killDiffCompression(snapshots: readonly BattleStateSnapshot[]): number {
  const killDiffs = snapshots.map((s) => {
    const kills = s.teamKills;
    if (kills.length < 2) {
      return 0;
    }
    return (kills[0] ?? 0) - (kills[1] ?? 0);
  });
  return rleCompressionRatio(killDiffs, 10);
}

// ─── Utility ───────────────────────────────────────────────────────

/** 母集団標準偏差（n で割る）。全スナップショットを母集団として扱う */
function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  const mean = sum / values.length;
  let sqSum = 0;
  for (const v of values) {
    const d = v - mean;
    sqSum += d * d;
  }
  return Math.sqrt(sqSum / values.length);
}
