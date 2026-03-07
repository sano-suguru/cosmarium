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
 * 正規化エントロピー H / log2(n)。0～1 にスケーリング。
 * n=1 の場合は 0 を返す（多様性なし）。
 */
export function normalizedEntropy(counts: readonly number[]): number {
  const nonZero = counts.filter((c) => c > 0).length;
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
  const freq = new Map<string, number>();
  if (n <= 0 || sequence.length < n) {
    return freq;
  }
  for (let i = 0; i <= sequence.length - n; i++) {
    const key = sequence.slice(i, i + n).join(',');
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
 * LZ77 風の簡易圧縮率でコルモゴロフ複雑性を近似。
 * 数値シーケンスを文字列化し、繰り返しパターンの検出でデータの「複雑さ」を推定。
 *
 * 戻り値: 0～1 の圧縮率（低い → 高い圧縮性 → パターンが単純、
 *         高い → 圧縮困難 → パターンが複雑/ランダム）
 */
export function lzComplexity(sequence: readonly number[]): number {
  if (sequence.length === 0) {
    return 0;
  }

  // Lempel-Ziv complexity: 新しい語彙の数をカウント
  const s = `${sequence.join(',')},`;
  const n = s.length;
  let complexity = 1;
  let i = 0;
  let iLen = 1;

  while (i + iLen <= n) {
    // s[i..i+iLen) が s[0..i) に含まれるか
    const sub = s.substring(i, i + iLen);
    const searchEnd = i + iLen - 1; // 自身を除く範囲で検索
    if (s.substring(0, searchEnd).includes(sub)) {
      iLen++;
    } else {
      complexity++;
      i += iLen;
      iLen = 1;
    }
  }

  // 正規化: 理論上限 n/log2(n) に対する比率
  const bound = n / Math.max(1, Math.log2(n));
  return Math.min(1, complexity / bound);
}

/**
 * バイト配列の圧縮率を run-length encoding で近似。
 * 空間分布のスナップショット等、連続データ向け。
 *
 * 戻り値: 圧縮後サイズ / 元サイズ（0～1。低い → 繰り返しが多い）
 */
export function rleCompressionRatio(data: readonly number[], precision: number = 1): number {
  if (data.length === 0) {
    return 0;
  }

  // 精度で量子化して RLE
  const quantized = data.map((v) => Math.round(v * precision));
  let runs = 1;
  for (let i = 1; i < quantized.length; i++) {
    if (quantized[i] !== quantized[i - 1]) {
      runs++;
    }
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

  // 空間エントロピーの標準偏差
  const spatials = snapshots.map((s) => s.spatialEntropy);
  const spatialStd = standardDeviation(spatials);

  // 総ユニット数の変化系列 → LZ 複雑性
  const totalCounts = snapshots.map((s) => {
    let sum = 0;
    for (const c of s.teamCounts) {
      sum += c;
    }
    return sum;
  });
  const countComplexity = lzComplexity(totalCounts);

  // キル差の変化系列 → RLE 圧縮率（拮抗度）
  const killDiffs = snapshots.map((s) => {
    const kills = s.teamKills;
    if (kills.length < 2) {
      return 0;
    }
    return (kills[0] ?? 0) - (kills[1] ?? 0);
  });
  const killVariance = rleCompressionRatio(killDiffs, 0.1);

  // 重み付き統合（各成分 0～1 にクリップ）
  return Math.min(1, spatialStd * 2) * 0.3 + countComplexity * 0.4 + killVariance * 0.3;
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
