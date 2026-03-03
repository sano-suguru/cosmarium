import { describe, expect, it } from 'vitest';
import type { FxQ16 } from '../fixed-point.ts';
import { FX_ONE, FX_SCALE, FX_ZERO, fromFx, toFx } from '../fixed-point.ts';
import { fxMulberry32 } from '../fixed-rng.ts';
import { FX_HALF_PI, FX_PI, FX_TAU, fxAtan2, fxCos, fxExpDecay, fxHypot, fxLn, fxSin, fxSqrt } from '../fixed-trig.ts';

const FX_EPSILON = 0.002; // Q16.16 精度 ≈ 1/65536 ≈ 0.0000153、LUT精度は粗め

// ── sin ──
describe('fxSin', () => {
  it('sin(0) ≈ 0', () => {
    expect(Math.abs(fromFx(fxSin(FX_ZERO)))).toBeLessThan(FX_EPSILON);
  });

  it('sin(π/2) ≈ 1', () => {
    expect(fromFx(fxSin(FX_HALF_PI))).toBeCloseTo(1, 2);
  });

  it('sin(π) ≈ 0', () => {
    expect(Math.abs(fromFx(fxSin(FX_PI)))).toBeLessThan(FX_EPSILON);
  });

  it('sin(3π/2) ≈ -1', () => {
    const angle = toFx(Math.PI * 1.5);
    expect(fromFx(fxSin(angle))).toBeCloseTo(-1, 2);
  });

  it('sin(2π) ≈ 0', () => {
    expect(Math.abs(fromFx(fxSin(FX_TAU)))).toBeLessThan(FX_EPSILON);
  });

  it('決定論性', () => {
    const angle = toFx(1.234);
    expect(fxSin(angle)).toBe(fxSin(angle));
  });
});

// ── cos ──
describe('fxCos', () => {
  it('cos(0) ≈ 1', () => {
    expect(fromFx(fxCos(FX_ZERO))).toBeCloseTo(1, 2);
  });

  it('cos(π/2) ≈ 0', () => {
    expect(Math.abs(fromFx(fxCos(FX_HALF_PI)))).toBeLessThan(FX_EPSILON);
  });

  it('cos(π) ≈ -1', () => {
    expect(fromFx(fxCos(FX_PI))).toBeCloseTo(-1, 2);
  });

  it('cos(2π) ≈ 1', () => {
    expect(fromFx(fxCos(FX_TAU))).toBeCloseTo(1, 2);
  });

  it('sin²+cos² ≈ 1 for various angles', () => {
    const angles = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0];
    for (const a of angles) {
      const fx = toFx(a);
      const s = fromFx(fxSin(fx));
      const c = fromFx(fxCos(fx));
      expect(s * s + c * c).toBeCloseTo(1.0, 2);
    }
  });
});

// ── atan2 ──
describe('fxAtan2', () => {
  it('atan2(0, 1) ≈ 0', () => {
    expect(Math.abs(fromFx(fxAtan2(FX_ZERO, FX_ONE)))).toBeLessThan(FX_EPSILON);
  });

  it('atan2(1, 0) ≈ π/2', () => {
    expect(fromFx(fxAtan2(FX_ONE, FX_ZERO))).toBeCloseTo(Math.PI / 2, 2);
  });

  it('atan2(0, -1) ≈ π', () => {
    expect(fromFx(fxAtan2(FX_ZERO, toFx(-1)))).toBeCloseTo(Math.PI, 2);
  });

  it('atan2(-1, 0) ≈ -π/2', () => {
    expect(fromFx(fxAtan2(toFx(-1), FX_ZERO))).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('atan2(0, 0) = 0', () => {
    expect(fxAtan2(FX_ZERO, FX_ZERO)).toBe(FX_ZERO);
  });

  it('全象限で Math.atan2 と ≈0.02 以内', () => {
    const vals = [-100, -10, -1, 1, 10, 100];
    for (const y of vals) {
      for (const x of vals) {
        const expected = Math.atan2(y, x);
        const got = fromFx(fxAtan2(toFx(y), toFx(x)));
        expect(Math.abs(got - expected)).toBeLessThan(0.02);
      }
    }
  });

  it('決定論性', () => {
    const y = toFx(42);
    const x = toFx(-17);
    expect(fxAtan2(y, x)).toBe(fxAtan2(y, x));
  });
});

// ── sqrt ──
describe('fxSqrt', () => {
  it('sqrt(0) = 0', () => {
    expect(fxSqrt(FX_ZERO)).toBe(FX_ZERO);
  });

  it('sqrt(1) ≈ 1', () => {
    expect(fromFx(fxSqrt(FX_ONE))).toBeCloseTo(1, 3);
  });

  it('sqrt(4) ≈ 2', () => {
    expect(fromFx(fxSqrt(toFx(4)))).toBeCloseTo(2, 3);
  });

  it('sqrt(100) ≈ 10', () => {
    expect(fromFx(fxSqrt(toFx(100)))).toBeCloseTo(10, 2);
  });

  it('sqrt(0.25) ≈ 0.5', () => {
    expect(fromFx(fxSqrt(toFx(0.25)))).toBeCloseTo(0.5, 3);
  });

  it('sqrt(負数) = 0', () => {
    expect(fxSqrt(toFx(-1))).toBe(FX_ZERO);
  });

  it('決定論性', () => {
    const v = toFx(42.5);
    expect(fxSqrt(v)).toBe(fxSqrt(v));
  });
});

// ── hypot ──
describe('fxHypot', () => {
  it('hypot(3, 4) ≈ 5', () => {
    expect(fromFx(fxHypot(toFx(3), toFx(4)))).toBeCloseTo(5, 1);
  });

  it('hypot(0, 5) = 5', () => {
    expect(fromFx(fxHypot(FX_ZERO, toFx(5)))).toBeCloseTo(5, 3);
  });

  it('hypot(5, 0) = 5', () => {
    expect(fromFx(fxHypot(toFx(5), FX_ZERO))).toBeCloseTo(5, 3);
  });

  it('hypot(-3, -4) ≈ 5', () => {
    expect(fromFx(fxHypot(toFx(-3), toFx(-4)))).toBeCloseTo(5, 1);
  });

  it('大きな距離: hypot(3000, 4000) ≈ 5000', () => {
    expect(fromFx(fxHypot(toFx(3000), toFx(4000)))).toBeCloseTo(5000, -1);
  });

  it('決定論性', () => {
    const x = toFx(123);
    const y = toFx(456);
    expect(fxHypot(x, y)).toBe(fxHypot(x, y));
  });
});

// ── expDecay ──
describe('fxExpDecay', () => {
  it('exp(0) = 1', () => {
    const result = fxExpDecay(toFx(-1) as FxQ16, FX_ZERO);
    expect(fromFx(result)).toBeCloseTo(1, 2);
  });

  it('exp(ln(0.5) * 1) ≈ 0.5', () => {
    const lnHalf = fxLn(0.5);
    const result = fxExpDecay(lnHalf, FX_ONE);
    expect(fromFx(result)).toBeCloseTo(0.5, 1);
  });

  it('exp(ln(0.97) * 30) ≈ 0.97^30 ≈ 0.401', () => {
    const lnBase = fxLn(0.97);
    const t = toFx(30);
    const result = fxExpDecay(lnBase, t);
    expect(fromFx(result)).toBeCloseTo(0.97 ** 30, 1);
  });

  it('base 0.82 の減衰: exp(ln(0.82) * 1) ≈ 0.82', () => {
    const lnBase = fxLn(0.82);
    const result = fxExpDecay(lnBase, FX_ONE);
    expect(fromFx(result)).toBeCloseTo(0.82, 1);
  });

  it('結果は [0, 1] の範囲にクランプされる', () => {
    // 非常に大きな負の指数 → 0 に近い
    const result = fxExpDecay(toFx(-10), toFx(10));
    expect(fromFx(result)).toBeGreaterThanOrEqual(0);
    expect(fromFx(result)).toBeLessThanOrEqual(1);
  });

  it('決定論性', () => {
    const lnBase = fxLn(0.35);
    const t = toFx(2.5);
    expect(fxExpDecay(lnBase, t)).toBe(fxExpDecay(lnBase, t));
  });
});

// ── fxMulberry32 ──
describe('fxMulberry32', () => {
  it('出力は [0, FX_ONE) の範囲', () => {
    const rng = fxMulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng() as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(FX_SCALE);
    }
  });

  it('同一シードで決定論的', () => {
    const rng1 = fxMulberry32(42);
    const rng2 = fxMulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('異なるシードで異なる出力', () => {
    const rng1 = fxMulberry32(1);
    const rng2 = fxMulberry32(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (rng1() === rng2()) {
        same++;
      }
    }
    expect(same).toBeLessThan(10);
  });
});
