import { describe, expect, it } from 'vitest';
import { FX_HALF, FX_NEG_ONE, FX_ONE, FX_ZERO, fromFx, fxMul, toFx } from '../fixed-point.ts';

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
