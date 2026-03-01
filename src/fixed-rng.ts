// ── Q16.16 固定小数点乱数 ──
import type { FxQ16 } from './fixed-point.ts';

/**
 * mulberry32 ベースの固定小数点 RNG を生成する。
 * 返す関数は呼ぶたびに [0, FX_ONE) (= [0, 65536)) の Q16.16 値を返す。
 * float版の rng() と同一のシードを使えば同一の内部状態遷移を辿る。
 * ただし rng 消費順序を共有するには、float版と fx版で同じ内部状態を使う必要がある。
 */
export function fxMulberry32(seed: number): () => FxQ16 {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // 上位16bitを取得して Q16.16 の [0, FX_ONE) を返す
    return ((t ^ (t >>> 14)) >>> 16) as FxQ16;
  };
}
