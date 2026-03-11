// 符号付き16.16形式: 上位16bitが整数部、下位16bitが小数部
// JS の number は 2^53 まで整数精度がある。fxMul の制約は同関数の JSDoc 参照

/** branded type で float との混同を防止 */
export type FxQ16 = number & { readonly __brand: 'FxQ16' };

const SHIFT = 16;
const SCALE = 1 << SHIFT; // 65536

export const FX_ZERO = 0 as FxQ16;
export const FX_ONE = SCALE as FxQ16;
export const FX_HALF = (SCALE >> 1) as FxQ16;
export const FX_NEG_ONE = -SCALE as FxQ16;
export const FX_SCALE = SCALE;

export function toFx(f: number): FxQ16 {
  return Math.round(f * SCALE) as FxQ16;
}

export function fromFx(q: FxQ16): number {
  return q / SCALE;
}

/**
 * Q16.16 乗算 — float64 中間値で計算
 * a * b / 2^16 を整数切り捨てで返す。
 * float64 は 2^53 まで整数精度があるため、|a|,|b| < 2^26.5 (実数値 ±724) なら
 * 中間値 a*b が 2^53 以内で誤差なし。WORLD_SIZE=4000 (Q16.16 ≈ 2^28) 同士の乗算では
 * 中間値 ~2^56 となり下位ビットに最大 ±8 の丸め誤差が生じうるが、
 * 座標×速度 (4000×220 → ~2^45) 等の典型ユースケースでは安全圏内。
 */
export function fxMul(a: FxQ16, b: FxQ16): FxQ16 {
  return Math.trunc(((a as number) * (b as number)) / SCALE) as FxQ16;
}
