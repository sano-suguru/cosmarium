import { describe, expect, it } from 'vitest';
import {
  FX_HALF,
  FX_NEG_ONE,
  FX_ONE,
  FX_ZERO,
  fromFx,
  fxAbs,
  fxAdd,
  fxCeil,
  fxClamp,
  fxDiv,
  fxFloor,
  fxMax,
  fxMin,
  fxMul,
  fxMulInt,
  fxNeg,
  fxSub,
  toFx,
} from '../fixed-point.ts';

// ── 変換 ──
describe('toFx / fromFx 変換', () => {
  it('0 の往復', () => {
    expect(fromFx(toFx(0))).toBe(0);
  });

  it('1 の往復', () => {
    expect(toFx(1)).toBe(FX_ONE);
    expect(fromFx(FX_ONE)).toBe(1);
  });

  it('-1 の往復', () => {
    expect(toFx(-1)).toBe(FX_NEG_ONE);
    expect(fromFx(FX_NEG_ONE)).toBe(-1);
  });

  it('0.5 の往復', () => {
    expect(toFx(0.5)).toBe(FX_HALF);
    expect(fromFx(FX_HALF)).toBeCloseTo(0.5, 4);
  });

  it('座標範囲 ±4000 が正しく変換される', () => {
    expect(fromFx(toFx(4000))).toBeCloseTo(4000, 0);
    expect(fromFx(toFx(-4000))).toBeCloseTo(-4000, 0);
  });

  it('小数精度 ≈ 1/65536', () => {
    const v = 3.14259;
    const fx = toFx(v);
    expect(Math.abs(fromFx(fx) - v)).toBeLessThan(1 / 65536 + 1e-10);
  });
});

// ── 定数 ──
describe('定数', () => {
  it('FX_ZERO', () => {
    expect(FX_ZERO as number).toBe(0);
  });

  it('FX_ONE', () => {
    expect(FX_ONE as number).toBe(65536);
  });

  it('FX_HALF', () => {
    expect(FX_HALF as number).toBe(32768);
  });

  it('FX_NEG_ONE', () => {
    expect(FX_NEG_ONE as number).toBe(-65536);
  });
});

// ── 加減算 ──
describe('fxAdd / fxSub', () => {
  it('1 + 1 = 2', () => {
    expect(fxAdd(FX_ONE, FX_ONE)).toBe(toFx(2));
  });

  it('1 + (-1) = 0', () => {
    expect(fxAdd(FX_ONE, FX_NEG_ONE)).toBe(FX_ZERO);
  });

  it('1 - 0.5 = 0.5', () => {
    expect(fxSub(FX_ONE, FX_HALF)).toBe(FX_HALF);
  });

  it('大きな座標の加算: 3000 + 1000 = 4000', () => {
    expect(fxAdd(toFx(3000), toFx(1000))).toBe(toFx(4000));
  });
});

// ── 乗算 ──
describe('fxMul', () => {
  it('1 * 1 = 1', () => {
    expect(fxMul(FX_ONE, FX_ONE)).toBe(FX_ONE);
  });

  it('0.5 * 2 = 1', () => {
    expect(fxMul(FX_HALF, toFx(2))).toBe(FX_ONE);
  });

  it('(-1) * (-1) = 1', () => {
    expect(fxMul(FX_NEG_ONE, FX_NEG_ONE)).toBe(FX_ONE);
  });

  it('(-1) * 1 = -1', () => {
    expect(fxMul(FX_NEG_ONE, FX_ONE)).toBe(FX_NEG_ONE);
  });

  it('座標 × 速度: 200 * 0.55 ≈ 110', () => {
    const result = fromFx(fxMul(toFx(200), toFx(0.55)));
    expect(result).toBeCloseTo(110, 0);
  });

  it('0 * 任意 = 0', () => {
    expect(fxMul(FX_ZERO, toFx(12345))).toBe(FX_ZERO);
  });

  it('大きな値: 220 * 220 = 48400', () => {
    const result = fromFx(fxMul(toFx(220), toFx(220)));
    expect(result).toBeCloseTo(48400, 0);
  });

  it('決定論性: 同じ入力 → 同じ出力', () => {
    const a = toFx(3.14259);
    const b = toFx(2.71928);
    const r1 = fxMul(a, b);
    const r2 = fxMul(a, b);
    expect(r1).toBe(r2);
  });
});

// ── 除算 ──
describe('fxDiv', () => {
  it('1 / 1 = 1', () => {
    expect(fxDiv(FX_ONE, FX_ONE)).toBe(FX_ONE);
  });

  it('1 / 2 = 0.5', () => {
    expect(fxDiv(FX_ONE, toFx(2))).toBe(FX_HALF);
  });

  it('100 / 3 ≈ 33.33', () => {
    const result = fromFx(fxDiv(toFx(100), toFx(3)));
    expect(result).toBeCloseTo(33.33, 1);
  });

  it('負 / 正 = 負', () => {
    const result = fxDiv(FX_NEG_ONE, toFx(2));
    expect(result as number).toBeLessThan(0);
    expect(fromFx(result)).toBeCloseTo(-0.5, 4);
  });
});

// ── 整数乗算 ──
describe('fxMulInt', () => {
  it('0.5 * 4 = 2', () => {
    expect(fxMulInt(FX_HALF, 4)).toBe(toFx(2));
  });

  it('座標 * 0 = 0', () => {
    expect(fxMulInt(toFx(4000), 0)).toBe(FX_ZERO);
  });
});

// ── 比較・クランプ ──
describe('fxAbs / fxNeg / fxMin / fxMax / fxClamp', () => {
  it('fxAbs(-1) = 1', () => {
    expect(fxAbs(FX_NEG_ONE)).toBe(FX_ONE);
  });

  it('fxAbs(1) = 1', () => {
    expect(fxAbs(FX_ONE)).toBe(FX_ONE);
  });

  it('fxNeg(1) = -1', () => {
    expect(fxNeg(FX_ONE)).toBe(FX_NEG_ONE);
  });

  it('fxMin(1, 2) = 1', () => {
    expect(fxMin(FX_ONE, toFx(2))).toBe(FX_ONE);
  });

  it('fxMax(1, 2) = 2', () => {
    expect(fxMax(FX_ONE, toFx(2))).toBe(toFx(2));
  });

  it('fxClamp(3, 0, 2) = 2', () => {
    expect(fxClamp(toFx(3), FX_ZERO, toFx(2))).toBe(toFx(2));
  });

  it('fxClamp(-1, 0, 2) = 0', () => {
    expect(fxClamp(FX_NEG_ONE, FX_ZERO, toFx(2))).toBe(FX_ZERO);
  });

  it('fxClamp(1, 0, 2) = 1', () => {
    expect(fxClamp(FX_ONE, FX_ZERO, toFx(2))).toBe(FX_ONE);
  });
});

// ── floor / ceil ──
describe('fxFloor / fxCeil', () => {
  it('floor(1.7) = 1', () => {
    expect(fromFx(fxFloor(toFx(1.7)))).toBe(1);
  });

  it('floor(-1.3) = -2', () => {
    expect(fromFx(fxFloor(toFx(-1.3)))).toBe(-2);
  });

  it('ceil(1.3) = 2', () => {
    expect(fromFx(fxCeil(toFx(1.3)))).toBe(2);
  });

  it('ceil(1.0) = 1', () => {
    expect(fromFx(fxCeil(FX_ONE))).toBe(1);
  });

  it('floor(0) = 0', () => {
    expect(fromFx(fxFloor(FX_ZERO))).toBe(0);
  });

  it('ceil(0) = 0', () => {
    expect(fromFx(fxCeil(FX_ZERO))).toBe(0);
  });

  it('ceil(-1.3) = -1', () => {
    expect(fromFx(fxCeil(toFx(-1.3)))).toBe(-1);
  });

  // 安全限界 (整数部 ±32767)
  it('floor(32767) = 32767', () => {
    expect(fromFx(fxFloor(toFx(32767)))).toBe(32767);
  });

  it('ceil(32767) = 32767', () => {
    expect(fromFx(fxCeil(toFx(32767)))).toBe(32767);
  });

  it('floor(-32767) = -32767', () => {
    expect(fromFx(fxFloor(toFx(-32767)))).toBe(-32767);
  });

  it('ceil(-32767) = -32767', () => {
    expect(fromFx(fxCeil(toFx(-32767)))).toBe(-32767);
  });

  // 限界付近の小数
  it('floor(32767.5) = 32767', () => {
    expect(fromFx(fxFloor(toFx(32767.5)))).toBe(32767);
  });

  it('ceil(32766.5) = 32767', () => {
    expect(fromFx(fxCeil(toFx(32766.5)))).toBe(32767);
  });

  // WORLD_SIZE 範囲
  it('floor(4000.7) = 4000', () => {
    expect(fromFx(fxFloor(toFx(4000.7)))).toBe(4000);
  });

  it('ceil(3999.3) = 4000', () => {
    expect(fromFx(fxCeil(toFx(3999.3)))).toBe(4000);
  });
});

// ── オーバーフロー安全性 ──
describe('オーバーフロー安全性', () => {
  it('座標(±4000) × 速度(220) が安全範囲内', () => {
    const coord = toFx(4000);
    const speed = toFx(220);
    const result = fxMul(coord, speed);
    expect(fromFx(result)).toBeCloseTo(880000, -2);
  });

  it('乗算結果は決定論的（2回計算して同一）', () => {
    const a = toFx(-3999.5);
    const b = toFx(219.8);
    expect(fxMul(a, b)).toBe(fxMul(a, b));
  });
});
