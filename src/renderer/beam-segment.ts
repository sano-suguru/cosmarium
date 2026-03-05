/**
 * ビームセグメント描画の共通視覚パラメータとヘルパー。
 * renderBeams / renderTrackingBeams / renderSquadronTethers が共有する
 * フリッカー・幅オシレーション・ステップ数計算を集約する。
 */

// ---- 幅オシレーション ----
/** ビーム幅 sin 振幅 (幅の ±25%) */
const BEAM_SIN_AMPLITUDE = 0.25;
/** カリング用の最大幅倍率 (1 + 振幅) */
export const BEAM_MAX_WIDTH_SCALE = 1 + BEAM_SIN_AMPLITUDE;

// ---- セグメント分割 ----
/** セグメント1個あたりのワールド距離 */
const BEAM_SEGMENT_STEP = 5;
/** 最小セグメント数 */
const BEAM_MIN_SEGMENTS = 3;

// ---- アルファ ----
/** ビーム/テザー共通のベースアルファ */
export const BEAM_ALPHA = 0.85;

// ---- 内部パラメータ (関数に閉じ込めるが定数として明示) ----
const FLICKER_BASE = 0.7;
const FLICKER_AMP = 0.3;
const FLICKER_SPATIAL_FREQ = 2.5;
const FLICKER_TEMPORAL_SPEED = 35;
const WIDTH_SPATIAL_FREQ = 0.6;
const WIDTH_TEMPORAL_SPEED = 25;

/** セグメント index と時刻からフリッカー係数 (0.4–1.0) を返す */
export function beamFlicker(j: number, now: number): number {
  return FLICKER_BASE + Math.sin(j * FLICKER_SPATIAL_FREQ + now * FLICKER_TEMPORAL_SPEED) * FLICKER_AMP;
}

/** セグメント index と時刻から幅スケール係数 (0.75–1.25) を返す */
export function beamWidthScale(j: number, now: number): number {
  return 1 + Math.sin(j * WIDTH_SPATIAL_FREQ + now * WIDTH_TEMPORAL_SPEED) * BEAM_SIN_AMPLITUDE;
}

/** 距離と分割係数からセグメント数を返す (最小 BEAM_MIN_SEGMENTS) */
export function beamSegmentCount(distance: number, stepDiv = 1): number {
  return Math.max(BEAM_MIN_SEGMENTS, (distance / (BEAM_SEGMENT_STEP * stepDiv)) | 0);
}

// ---- コールバック型 ----
/** ビームセグメント1個を描画するコールバック */
export type BeamEmitFn = (
  x: number,
  y: number,
  w: number,
  r: number,
  g: number,
  b: number,
  a: number,
  ang: number,
) => void;
/** セグメントがカメラ視錐台内かを判定するコールバック */
export type BeamVisibilityFn = (x1: number, y1: number, x2: number, y2: number, hw: number) => boolean;
