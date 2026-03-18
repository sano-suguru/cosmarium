import { TAU } from '../constants.ts';
import { devWarn } from '../ui/dev-overlay/DevOverlay.tsx';
import { instanceData, instanceDataI32, MAX_INSTANCES, STRIDE_FLOATS, writeSlots } from './buffers.ts';

// TAU multiple keeps sin(now*N) continuous at wrap boundary; ×10000 ≈ 17.5h before reset
export const WRAP_PERIOD = TAU * 10000;

/**
 * カリング境界 — renderScene() のみが毎フレーム設定するモジュールレベル状態。
 * _writer と同様、JS シングルスレッド実行で安全。renderScene 以外から書き換えてはならない。
 */
let _cullMinX = 0;
let _cullMaxX = 0;
let _cullMinY = 0;
let _cullMaxY = 0;

const _writer = { idx: 0, overflowWarned: false };

/** フレーム開始時にインスタンスカウンタをリセットする */
export function beginFrame() {
  _writer.idx = 0;
}

/** 現フレームで書き込まれたインスタンス数を返す */
export function getInstanceCount(): number {
  return _writer.idx;
}

export function setCullBounds(minX: number, maxX: number, minY: number, maxY: number) {
  _cullMinX = minX;
  _cullMaxX = maxX;
  _cullMinY = minY;
  _cullMaxY = maxY;
}

export function writeInstance(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number,
) {
  if (_writer.idx < MAX_INSTANCES) {
    writeSlots(instanceData, instanceDataI32, _writer.idx * STRIDE_FLOATS, x, y, size, r, g, b, a, angle, shape);
    _writer.idx++;
  } else if (!_writer.overflowWarned) {
    devWarn(`writeInstance: idx(${_writer.idx}) >= MAX_INSTANCES(${MAX_INSTANCES}), drawing skipped`);
    _writer.overflowWarned = true;
  }
}

export function writeOverlay(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  shape: number,
) {
  writeInstance(x, y, size, r, g, b, a, 0, shape);
}

export function isCircleVisible(x: number, y: number, r: number): boolean {
  return x + r >= _cullMinX && x - r <= _cullMaxX && y + r >= _cullMinY && y - r <= _cullMaxY;
}

export function isSegmentVisible(x1: number, y1: number, x2: number, y2: number, hw: number): boolean {
  const bMinX = (x1 < x2 ? x1 : x2) - hw;
  const bMaxX = (x1 > x2 ? x1 : x2) + hw;
  const bMinY = (y1 < y2 ? y1 : y2) - hw;
  const bMaxY = (y1 > y2 ? y1 : y2) + hw;
  return bMaxX >= _cullMinX && bMinX <= _cullMaxX && bMaxY >= _cullMinY && bMinY <= _cullMaxY;
}
