// ── Q16.16 固定小数点演算 ──
// 符号付き16.16形式: 上位16bitが整数部、下位16bitが小数部
// JS の number は 2^53 まで整数精度があるため、中間値は安全圏内

/** branded type で float との混同を防止 */
export type FxQ16 = number & { readonly __brand: 'FxQ16' };

const SHIFT = 16;
const SCALE = 1 << SHIFT; // 65536
const FRAC_MASK = SCALE - 1; // 0xFFFF

// ── 定数 ──
export const FX_ZERO = 0 as FxQ16;
export const FX_ONE = SCALE as FxQ16;
export const FX_HALF = (SCALE >> 1) as FxQ16;
export const FX_NEG_ONE = -SCALE as FxQ16;
export const FX_SCALE = SCALE;

// ── 変換 ──
export function toFx(f: number): FxQ16 {
  return Math.round(f * SCALE) as FxQ16;
}

export function fromFx(q: FxQ16): number {
  return q / SCALE;
}

// ── 四則演算 ──
export function fxAdd(a: FxQ16, b: FxQ16): FxQ16 {
  return (a + b) as FxQ16;
}

export function fxSub(a: FxQ16, b: FxQ16): FxQ16 {
  return (a - b) as FxQ16;
}

/**
 * Q16.16 乗算 — float64 中間値で安全に計算
 * a * b / 2^16 を整数切り捨てで返す
 * JS の number (float64) は 2^53 まで整数精度があるため、
 * |a|,|b| < 2^31 なら中間値 a*b < 2^62 で安全圏内
 */
export function fxMul(a: FxQ16, b: FxQ16): FxQ16 {
  return Math.trunc(((a as number) * (b as number)) / SCALE) as FxQ16;
}

/**
 * Q16.16 除算
 * a * 65536 は最大 2^47 で 2^53 以内
 */
export function fxDiv(a: FxQ16, b: FxQ16): FxQ16 {
  return Math.trunc(((a as number) * SCALE) / (b as number)) as FxQ16;
}

// ── 整数乗算 ──
export function fxMulInt(a: FxQ16, n: number): FxQ16 {
  return (a * n) as FxQ16;
}

// ── 比較・クランプ ──
export function fxAbs(a: FxQ16): FxQ16 {
  return (a < 0 ? -a : a) as FxQ16;
}

export function fxNeg(a: FxQ16): FxQ16 {
  return -a as FxQ16;
}

export function fxMin(a: FxQ16, b: FxQ16): FxQ16 {
  return (a < b ? a : b) as FxQ16;
}

export function fxMax(a: FxQ16, b: FxQ16): FxQ16 {
  return (a > b ? a : b) as FxQ16;
}

export function fxClamp(v: FxQ16, lo: FxQ16, hi: FxQ16): FxQ16 {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Q16.16 floor — 小数部を切り捨てる
 * ビット演算 (ToInt32) を使用するため、整数部 ±32767 が安全限界。
 * WORLD_SIZE=4000 の範囲では安全。
 */
export function fxFloor(a: FxQ16): FxQ16 {
  return (a & ~FRAC_MASK) as FxQ16;
}

/**
 * Q16.16 ceil — 小数部を切り上げる
 * ビット演算 (ToInt32) を使用するため、整数部 ±32767 が安全限界。
 * WORLD_SIZE=4000 の範囲では安全。
 */
export function fxCeil(a: FxQ16): FxQ16 {
  return ((a + FRAC_MASK) & ~FRAC_MASK) as FxQ16;
}
