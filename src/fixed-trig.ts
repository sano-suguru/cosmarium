// ── LUTベース三角関数 + sqrt (Q16.16) ──
import type { FxQ16 } from './fixed-point.ts';
import { FX_ONE, FX_SCALE, FX_ZERO, fxMul, toFx } from './fixed-point.ts';

// ── 角度定数 ──
export const FX_PI = toFx(Math.PI);
export const FX_TAU = toFx(Math.PI * 2);
export const FX_HALF_PI = toFx(Math.PI / 2);

// ── LUT ──
const LUT_SIZE = 4096;
const LUT_MASK = LUT_SIZE - 1;

/** sin LUT: Q16.16値を格納。1周 = LUT_SIZE エントリ (精度 ≈ 0.088°) */
const SIN_LUT = new Int32Array(LUT_SIZE);

for (let i = 0; i < LUT_SIZE; i++) {
  SIN_LUT[i] = Math.round(Math.sin((i / LUT_SIZE) * Math.PI * 2) * FX_SCALE);
}

// ── 角度→LUTインデックス変換 ──
// Q16.16 角度を [0, TAU) にラップし LUT_SIZE にスケール
// index = angle * LUT_SIZE / FX_TAU
const FX_TAU_NUM = FX_TAU as number;

function angleToIndex(angle: FxQ16): number {
  let a = (angle as number) % FX_TAU_NUM;
  if (a < 0) a += FX_TAU_NUM;
  return ((a * LUT_SIZE) / FX_TAU_NUM) & LUT_MASK;
}

// ── sin / cos ──
export function fxSin(angle: FxQ16): FxQ16 {
  const idx = angleToIndex(angle);
  return (SIN_LUT[idx] ?? 0) as FxQ16;
}

export function fxCos(angle: FxQ16): FxQ16 {
  // cos(x) = sin(x + π/2)
  const idx = (angleToIndex(angle) + (LUT_SIZE >> 2)) & LUT_MASK;
  return (SIN_LUT[idx] ?? 0) as FxQ16;
}

// ── atan2 ──
// CORDIC-lite: 象限折り返し + LUT
const ATAN_LUT_SIZE = 1024;
const ATAN_LUT = new Int32Array(ATAN_LUT_SIZE + 1);

for (let i = 0; i <= ATAN_LUT_SIZE; i++) {
  ATAN_LUT[i] = Math.round(Math.atan(i / ATAN_LUT_SIZE) * FX_SCALE);
}

export function fxAtan2(y: FxQ16, x: FxQ16): FxQ16 {
  const ax = (x < 0 ? -x : x) as number;
  const ay = (y < 0 ? -y : y) as number;

  if (ax === 0 && ay === 0) return FX_ZERO;

  let angle: number;
  if (ax >= ay) {
    const idx = ((ay * ATAN_LUT_SIZE) / ax + 0.5) | 0;
    angle = ATAN_LUT[idx] ?? 0;
  } else {
    const idx = ((ax * ATAN_LUT_SIZE) / ay + 0.5) | 0;
    angle = (FX_HALF_PI as number) - (ATAN_LUT[idx] ?? 0);
  }

  // 象限復元
  if (x < 0) angle = (FX_PI as number) - angle;
  if (y < 0) angle = -angle;

  return angle as FxQ16;
}

// ── sqrt ──
/**
 * Newton-Raphson。初期推定は float の Math.sqrt で算出し Q16.16 に変換。
 * 結果は固定小数点に丸められるため決定論的。
 *
 * NOTE: Math.sqrt は IEEE 754 correctly rounded を保証するため同一プラットフォーム内では
 * 決定論的だが、クロスプラットフォーム lockstep が必要になった場合は pure fixed-point
 * Newton-Raphson（初期推定をビットシフトで算出）への置き換えを検討すること。
 */
export function fxSqrt(a: FxQ16): FxQ16 {
  if (a <= 0) return FX_ZERO;

  // Q16.16 → float → sqrt → Q16.16 で初期推定
  const floatSqrt = Math.sqrt((a as number) / FX_SCALE);
  let x = Math.round(floatSqrt * FX_SCALE);

  // Newton-Raphson: x = (x + a / x) / 2 — Q16.16 除算を使用
  // 2回の反復で十分な精度
  x = Math.trunc((x + Math.trunc(((a as number) * FX_SCALE) / x)) / 2);
  x = Math.trunc((x + Math.trunc(((a as number) * FX_SCALE) / x)) / 2);

  return x as FxQ16;
}

// ── hypot ──
// fxSqrt(x*x + y*y) だと中間オーバーフローの恐れがあるため、
// 大きい方でスケーリングして安全に計算
export function fxHypot(x: FxQ16, y: FxQ16): FxQ16 {
  const ax = (x < 0 ? -x : x) as number;
  const ay = (y < 0 ? -y : y) as number;
  if (ax === 0) return ay as FxQ16;
  if (ay === 0) return ax as FxQ16;

  // |ax| >= |ay| にスワップ
  const big = ax >= ay ? ax : ay;
  const small = ax >= ay ? ay : ax;

  // ratio = small / big (Q16.16) — float64 で計算してオーバーフロー回避
  const ratio = (small * FX_SCALE) / big;
  // ratio^2 (Q16.16) — float64 中間値で計算
  const rr = (ratio * ratio) / FX_SCALE;
  // sqrt(1 + ratio^2) の Q16.16 値
  const oneRr = (FX_SCALE + rr) | 0;
  const sqrtVal = fxSqrt(oneRr as FxQ16);

  return fxMul(big as FxQ16, sqrtVal);
}

// ── 指数減衰 ──
/**
 * exp(lnBase * t) の多項式近似 (Taylor 4次)
 * 用途: 1 - base^(dt*REF_FPS) → 1 - exp(ln(base) * dt * REF_FPS)
 * lnBase は負値（base < 1 のため）、t は正値
 *
 * 有効範囲: |lnBase * t| ≲ 3.0 で実用精度。
 * base ∈ [0.8, 0.99], t ∈ [0, 60] 程度のゲーム内減衰パラメータ向け。
 * base < 0.5 かつ大きな t では精度が著しく低下する（クランプで保護）。
 */
export function fxExpDecay(lnBase: FxQ16, t: FxQ16): FxQ16 {
  // x = lnBase * t (Q16.16)
  const x = fxMul(lnBase, t);

  // Taylor expansion: e^x ≈ 1 + x + x²/2 + x³/6 + x⁴/24
  const x2 = fxMul(x, x);
  const x3 = fxMul(x2, x);
  const x4 = fxMul(x3, x);

  // 定数 (Q16.16): 1/2, 1/6, 1/24
  const half = (FX_SCALE >> 1) as FxQ16;
  const sixth = ((FX_SCALE / 6 + 0.5) | 0) as FxQ16;
  const twentyFourth = ((FX_SCALE / 24 + 0.5) | 0) as FxQ16;

  const term2 = fxMul(x2, half);
  const term3 = fxMul(x3, sixth);
  const term4 = fxMul(x4, twentyFourth);

  const result = (FX_ONE as number) + (x as number) + (term2 as number) + (term3 as number) + (term4 as number);

  // クランプ: exp(負数) は (0, 1] の範囲
  if (result <= 0) return FX_ZERO;
  if (result > (FX_ONE as number)) return FX_ONE;
  return result as FxQ16;
}

// ── ユーティリティ: ln(x) の Q16.16 版 ──
// base (0, 1) の定数に対して事前計算用
export function fxLn(x: number): FxQ16 {
  return toFx(Math.log(x));
}
