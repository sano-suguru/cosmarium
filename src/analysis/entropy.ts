import type { FleetComposition } from '../types.ts';
import { TYPES } from '../unit-types.ts';

// ─── Shannon Entropy ───────────────────────────────────────────────

/**
 * 離散確率分布のシャノンエントロピー H = -Σ p_i log2(p_i) を計算。
 * 結果は 0（完全均一 or 単一要素）～ log2(n)（完全一様分布）のビット値。
 */
export function shannonEntropy(counts: readonly number[]): number {
  let total = 0;
  for (const c of counts) {
    total += c;
  }
  if (total <= 0) {
    return 0;
  }
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * 正規化エントロピー H / log2(k)。0～1 にスケーリング。
 * k は非ゼロ要素数（全カテゴリ数ではなく、観測されたカテゴリ数で正規化）。
 * これにより「使用中のカテゴリ間の均等性」を測定する。
 * k ≤ 1 の場合は 0 を返す（多様性なし）。
 */
export function normalizedEntropy(counts: readonly number[]): number {
  let nonZero = 0;
  for (const c of counts) {
    if (c > 0) {
      nonZero++;
    }
  }
  if (nonZero <= 1) {
    return 0;
  }
  return shannonEntropy(counts) / Math.log2(nonZero);
}

// ─── Fleet Diversity ───────────────────────────────────────────────

/**
 * 艦隊構成のシャノンエントロピーを「多様性スコア」として計算。
 * 各ユニットタイプの個数を確率分布とみなす。
 *
 * - 0 に近い → 単一ユニット型に偏重（スウォーム型）
 * - 1 に近い → ユニット型が均等に分散（混成型）
 */
export function fleetDiversity(fleet: FleetComposition): number {
  const counts: number[] = new Array(TYPES.length).fill(0);
  for (const entry of fleet) {
    const idx = entry.type;
    const prev = counts[idx];
    if (idx >= 0 && prev !== undefined) {
      counts[idx] = prev + entry.count;
    }
  }
  return normalizedEntropy(counts);
}

/**
 * 艦隊構成のコスト加重エントロピー。
 * 個数ではなく「そのユニット型に費やした予算」の分布で計算する。
 * コストの高いユニットを少数含む場合と安いユニットを大量に含む場合の違いを反映。
 */
export function fleetCostEntropy(fleet: FleetComposition): number {
  const costDist: number[] = new Array(TYPES.length).fill(0);
  for (const entry of fleet) {
    const idx = entry.type;
    const cost = TYPES[idx]?.cost ?? 1;
    const cprev = costDist[idx];
    if (idx >= 0 && cprev !== undefined) {
      costDist[idx] = cprev + entry.count * cost;
    }
  }
  return normalizedEntropy(costDist);
}

// ─── N-gram Frequency Analysis ─────────────────────────────────────

/**
 * イベントシーケンスから N-gram 頻度マップを生成。
 * 戦闘イベント列（例: キルログの killer type → victim type ペア）の
 * パターン分析に使用。
 */
export function ngramFrequencies(sequence: readonly number[], n: number): Map<string, number> {
  if (n <= 0 || sequence.length < n) {
    return new Map();
  }
  if (n === 2) {
    return bigramFrequencies(sequence);
  }
  const freq = new Map<string, number>();
  for (let i = 0; i <= sequence.length - n; i++) {
    const key = sequence.slice(i, i + n).join(',');
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

/** Bigram (n=2) 専用の高速頻度集計 — slice + join を排除し GC 圧力を削減 */
function bigramFrequencies(sequence: readonly number[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (let i = 0; i <= sequence.length - 2; i++) {
    const key = `${sequence[i]},${sequence[i + 1]}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

/**
 * N-gram 分布のエントロピー。高い → パターンが多様、低い → 同じパターンが繰り返される。
 */
export function ngramEntropy(sequence: readonly number[], n: number): number {
  const freq = ngramFrequencies(sequence, n);
  const counts: number[] = [];
  for (const c of freq.values()) {
    counts.push(c);
  }
  return shannonEntropy(counts);
}

// ─── Compression Ratio (Kolmogorov Complexity Approximation) ───────

/**
 * LZ76 アルゴリズムによるコルモゴロフ複雑性の近似。
 * 数値配列を直接操作し、既出部分列を探索。
 *
 * 戻り値: 0～1 の複雑性スコア（低い → パターンが単純、
 *         高い → パターンが複雑/ランダム）
 */
export function lzComplexity(sequence: readonly number[]): number {
  const n = sequence.length;
  if (n === 0) {
    return 0;
  }

  let novelPhrases = 1;
  let i = 0;
  let phraseLen = 1;

  while (i + phraseLen <= n) {
    if (findInHistory(sequence, i, phraseLen)) {
      phraseLen++;
    } else {
      novelPhrases++;
      i += phraseLen;
      phraseLen = 1;
    }
  }

  const theoreticalBound = n / Math.max(1, Math.log2(n));
  return Math.min(1, novelPhrases / theoreticalBound);
}

/**
 * sequence[start..start+len) が sequence[0..start+len-1) 内に存在するか判定。
 * 計算量: 外側ループ全体で O(n²·L)（L=最大フレーズ長）。
 * phraseLen が増えると i が大きくジャンプするため、バッチ分析の典型的な入力サイズ
 * （DEFAULT_MAX_STEPS / snapshotInterval ≈ 180 要素）では問題にならない。
 */
function findInHistory(sequence: readonly number[], start: number, len: number): boolean {
  const boundary = start + len - 1;
  outer: for (let h = 0; h <= boundary - len; h++) {
    for (let k = 0; k < len; k++) {
      if (sequence[h + k] !== sequence[start + k]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/**
 * バイト配列の圧縮率を run-length encoding で近似。
 * 空間分布のスナップショット等、連続データ向け。
 *
 * 戻り値: 圧縮後サイズ / 元サイズ（0～1。低い → 繰り返しが多い）
 *
 * @param quantizeScale 量子化スケール。値を `quantizeScale` 倍してから丸める。
 *   大きい値ほど近い値が同一ランとみなされにくい（精度が上がる）。
 *   - `1`（デフォルト）: 整数丸め。整数列やインデックス列向け。
 *   - `0.1`: 小数点第1位まで保持。座標差分など浮動小数点データ向け。
 *   - `100`: 小数点第2位まで保持（百分率等）。
 */
export function rleCompressionRatio(data: readonly number[], quantizeScale: number = 1): number {
  if (data.length === 0) {
    return 0;
  }

  let runs = 1;
  let prev = Math.round((data[0] ?? 0) * quantizeScale);
  for (let i = 1; i < data.length; i++) {
    const cur = Math.round((data[i] ?? 0) * quantizeScale);
    if (cur !== prev) {
      runs++;
    }
    prev = cur;
  }

  return runs / data.length;
}

// ─── Spatial Entropy ───────────────────────────────────────────────

/**
 * 2D 空間のグリッド分割によるエントロピー。
 * ユニット座標をグリッドセルに離散化し、セルごとの占有数分布のエントロピーを計算。
 *
 * - 低い → ユニットが少数のセルに集中（密集陣形）
 * - 高い → ユニットが広範に分散（散開陣形）
 *
 * @param positions [x0,y0, x1,y1, ...] のインターリーブ配列
 * @param worldSize ワールドの一辺サイズ
 * @param gridDiv グリッドの分割数（デフォルト 8 → 64セル）
 */
export function spatialEntropy(positions: readonly number[], worldSize: number, gridDiv: number = 8): number {
  const totalCells = gridDiv * gridDiv;
  const cellSize = worldSize / gridDiv;
  const cellCounts = new Array<number>(totalCells).fill(0);

  const numUnits = Math.floor(positions.length / 2);
  for (let i = 0; i < numUnits; i++) {
    const x = positions[i * 2] ?? 0;
    const y = positions[i * 2 + 1] ?? 0;
    const cx = Math.min(gridDiv - 1, Math.max(0, Math.floor(x / cellSize)));
    const cy = Math.min(gridDiv - 1, Math.max(0, Math.floor(y / cellSize)));
    const cellIdx = cy * gridDiv + cx;
    const cellPrev = cellCounts[cellIdx];
    if (cellPrev !== undefined) {
      cellCounts[cellIdx] = cellPrev + 1;
    }
  }

  return normalizedEntropy(cellCounts);
}

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

  return spatialDynamics * 0.3 + countPredictability * 0.4 + killBalance * 0.3;
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
  return rleCompressionRatio(killDiffs, 0.1);
}

// ─── Utility ───────────────────────────────────────────────────────

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
