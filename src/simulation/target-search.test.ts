import { afterEach, describe, expect, it } from 'vitest';
import { overrideType, resetPools, resetState } from '../__test__/pool-helper.ts';
import type { Unit } from '../types.ts';
import { BOMBER_TYPE, DRONE_TYPE, FLAGSHIP_TYPE, unitType } from '../unit-type-accessors.ts';
import { MASS_CAP, MIN_MASS_FACTOR, massFactor, targetScore } from './target-search.ts';

afterEach(() => {
  resetPools();
  resetState();
});

function fakeUnit(x: number, y: number, typeIdx: number): Unit {
  return { x, y, type: typeIdx } as Unit;
}

/** テスト用: 全ターゲットが交戦範囲内に収まる十分大きな aggroR2 */
const FAR = 1e12;

describe('targetScore — 三すくみ massWeight', () => {
  const ux = 0,
    uy = 0;

  it('massWeight=0 → 距離のみ（mass 無関係）', () => {
    const small = fakeUnit(100, 0, DRONE_TYPE);
    const big = fakeUnit(100, 0, FLAGSHIP_TYPE);
    expect(targetScore(ux, uy, small, 0, FAR)).toBe(targetScore(ux, uy, big, 0, FAR));
  });

  it('massWeight>0 → 大 mass 敵のスコアが低い（優先される）', () => {
    const small = fakeUnit(100, 0, DRONE_TYPE);
    const big = fakeUnit(100, 0, FLAGSHIP_TYPE);
    const wt = 0.1;
    expect(targetScore(ux, uy, big, wt, FAR)).toBeLessThan(targetScore(ux, uy, small, wt, FAR));
  });

  it('massWeight<0 → 小 mass 敵のスコアが低い（優先される）', () => {
    const small = fakeUnit(100, 0, DRONE_TYPE);
    const big = fakeUnit(100, 0, FLAGSHIP_TYPE);
    const wt = -0.1;
    expect(targetScore(ux, uy, small, wt, FAR)).toBeLessThan(targetScore(ux, uy, big, wt, FAR));
  });

  it('母艦級 mass（45+）でもスコアが有界', () => {
    const mothership = fakeUnit(100, 0, FLAGSHIP_TYPE);
    const restore = overrideType(FLAGSHIP_TYPE, { mass: 45 });
    try {
      const score = targetScore(ux, uy, mothership, -0.12, FAR);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1e12);

      // mass=30 と mass=45 で同じスコアになる（キャップされているため）
      const restore2 = overrideType(FLAGSHIP_TYPE, { mass: 30 });
      try {
        const scoreCapped = targetScore(ux, uy, mothership, -0.12, FAR);
        expect(score).toBe(scoreCapped);
      } finally {
        restore2();
      }
    } finally {
      restore();
    }
  });

  it('massWeight=0 かつ距離 0 → スコア 0', () => {
    const t = fakeUnit(0, 0, DRONE_TYPE);
    expect(targetScore(0, 0, t, 0, FAR)).toBe(0);
  });

  it('三すくみ: 小型→大型優先、中型→小型優先、大型→中型優先', () => {
    const droneMw = unitType(DRONE_TYPE).massWeight;
    const bomberMw = unitType(BOMBER_TYPE).massWeight;
    const flagshipMw = unitType(FLAGSHIP_TYPE).massWeight;

    const dEnemy = fakeUnit(200, 0, DRONE_TYPE); // mass=1
    const bEnemy = fakeUnit(200, 0, BOMBER_TYPE); // mass=4
    const fEnemy = fakeUnit(200, 0, FLAGSHIP_TYPE); // mass=30

    // 小型(Drone, mw>0) → Flagship(大mass) を Bomber(中mass) より優先
    expect(targetScore(ux, uy, fEnemy, droneMw, FAR)).toBeLessThan(targetScore(ux, uy, bEnemy, droneMw, FAR));

    // 中型(Bomber, mw<0) → Drone(小mass) を Flagship(大mass) より優先
    expect(targetScore(ux, uy, dEnemy, bomberMw, FAR)).toBeLessThan(targetScore(ux, uy, fEnemy, bomberMw, FAR));

    // 大型(Flagship, mw>0小) → Bomber(中mass) を Drone(小mass) より優先
    expect(targetScore(ux, uy, bEnemy, flagshipMw, FAR)).toBeLessThan(targetScore(ux, uy, dEnemy, flagshipMw, FAR));
  });
});

describe('targetScore — massFactor 下限クランプ', () => {
  const ux = 0,
    uy = 0;

  it('負 massWeight + 高 mass でもスコアが過小にならない（下限クランプ）', () => {
    const bigEnemy = fakeUnit(100, 0, FLAGSHIP_TYPE);
    const restore = overrideType(FLAGSHIP_TYPE, { mass: 30 });
    try {
      const d2 = 100 * 100;
      const score = targetScore(ux, uy, bigEnemy, -0.5, FAR);
      // MIN_MASS_FACTOR=0.25 → mf²=0.0625 → score = d² / 0.0625 = d² * 16
      expect(score).toBeLessThanOrEqual(d2 * 16);
      expect(score).toBeGreaterThan(d2);
    } finally {
      restore();
    }
  });

  it('下限クランプにより massWeight=-1.0, mass=30 でも有界', () => {
    const bigEnemy = fakeUnit(100, 0, FLAGSHIP_TYPE);
    const restore = overrideType(FLAGSHIP_TYPE, { mass: 30 });
    try {
      const scoreHigh = targetScore(ux, uy, bigEnemy, -1.0, FAR);
      const scoreMid = targetScore(ux, uy, bigEnemy, -0.5, FAR);
      // 両方とも下限クランプで同じスコアになるはず
      expect(scoreHigh).toBe(scoreMid);
    } finally {
      restore();
    }
  });
});

describe('targetScore — 距離差', () => {
  const ux = 0,
    uy = 0;

  it('同 mass 異距離 → 近い方が低スコア', () => {
    const near = fakeUnit(50, 0, DRONE_TYPE);
    const far = fakeUnit(200, 0, DRONE_TYPE);
    expect(targetScore(ux, uy, near, 0, FAR)).toBeLessThan(targetScore(ux, uy, far, 0, FAR));
    expect(targetScore(ux, uy, near, 0.1, FAR)).toBeLessThan(targetScore(ux, uy, far, 0.1, FAR));
    expect(targetScore(ux, uy, near, -0.1, FAR)).toBeLessThan(targetScore(ux, uy, far, -0.1, FAR));
  });

  it('massWeight<0 で近い大型 vs 遠い小型 → 距離効果が mass 嗜好を上回るケース', () => {
    const nearBig = fakeUnit(10, 0, FLAGSHIP_TYPE); // mass=30, d²=100
    const farSmall = fakeUnit(500, 0, DRONE_TYPE); // mass=1, d²=250000
    expect(targetScore(ux, uy, nearBig, -0.05, FAR)).toBeLessThan(targetScore(ux, uy, farSmall, -0.05, FAR));
  });

  it('距離 0 → スコア 0（massWeight に関わらず）', () => {
    const here = fakeUnit(0, 0, FLAGSHIP_TYPE);
    expect(targetScore(ux, uy, here, 0, FAR)).toBe(0);
    expect(targetScore(ux, uy, here, 0.12, FAR)).toBe(0);
    expect(targetScore(ux, uy, here, -0.12, FAR)).toBe(0);
  });
});

describe('massFactor — 直接テスト', () => {
  it('massWeight=0 → 常に 1', () => {
    expect(massFactor(0, 1)).toBe(1);
    expect(massFactor(0, 30)).toBe(1);
  });

  it('正の massWeight → mass 比例で増加', () => {
    const mf1 = massFactor(0.1, 5);
    const mf2 = massFactor(0.1, 15);
    expect(mf2).toBeGreaterThan(mf1);
    // base = 1 + 0.1 * mass
    expect(mf1).toBeCloseTo(1 + 0.1 * 5);
    expect(mf2).toBeCloseTo(1 + 0.1 * 15);
  });

  it('負の massWeight → 減少 + MIN_MASS_FACTOR でクランプ', () => {
    // 負の massWeight: mf = max(1 / (1 + |mw| * m), MIN_MASS_FACTOR)
    const mf = massFactor(-0.1, 5);
    expect(mf).toBeCloseTo(1 / (1 + 0.1 * 5));
    expect(mf).toBeLessThan(1);

    // 極端な値でも MIN_MASS_FACTOR 以下にならない
    const mfExtreme = massFactor(-1.0, 30);
    expect(mfExtreme).toBe(MIN_MASS_FACTOR);
  });

  it('mass > MASS_CAP → キャップ適用', () => {
    const atCap = massFactor(0.1, MASS_CAP);
    const overCap = massFactor(0.1, MASS_CAP + 20);
    expect(overCap).toBe(atCap);
  });

  it('境界値: mass=0 → massWeight に関わらず 1', () => {
    expect(massFactor(0.5, 0)).toBe(1);
    expect(massFactor(-0.5, 0)).toBe(1);
  });

  it('境界値: mass=MASS_CAP → キャップ境界', () => {
    const mf = massFactor(0.1, MASS_CAP);
    expect(mf).toBeCloseTo(1 + 0.1 * MASS_CAP);
  });
});

describe('targetScore — aggroR2 による mass 嗜好の範囲制限', () => {
  const ux = 0,
    uy = 0;

  it('交戦範囲外の敵 → massWeight に関わらず純粋な d² を返す', () => {
    const aggroR2 = 300 * 300; // 交戦範囲 300
    const farBig = fakeUnit(500, 0, FLAGSHIP_TYPE); // d²=250000 > aggroR2
    const farSmall = fakeUnit(500, 0, DRONE_TYPE);
    // 同距離なら mass 無関係で同スコア
    expect(targetScore(ux, uy, farBig, 0.12, aggroR2)).toBe(targetScore(ux, uy, farSmall, 0.12, aggroR2));
  });

  it('交戦範囲内の敵 → massWeight が適用される', () => {
    const aggroR2 = 300 * 300;
    const nearBig = fakeUnit(100, 0, FLAGSHIP_TYPE); // d²=10000 < aggroR2
    const nearSmall = fakeUnit(100, 0, DRONE_TYPE);
    // 正の massWeight → 大 mass 優先（スコアが低い）
    expect(targetScore(ux, uy, nearBig, 0.12, aggroR2)).toBeLessThan(targetScore(ux, uy, nearSmall, 0.12, aggroR2));
  });

  it('遠方の母艦より近くの小型敵が優先される', () => {
    // 母艦バグの再現防止: 正 massWeight で遠方の高 mass 敵が近くの低 mass 敵より優先されない
    const aggroR2 = 400 * 400;
    const restore = overrideType(FLAGSHIP_TYPE, { mass: 45 }); // 母艦級
    try {
      const farMothership = fakeUnit(1000, 0, FLAGSHIP_TYPE); // d²=1e6 >> aggroR2
      const nearDrone = fakeUnit(250, 0, DRONE_TYPE); // d²=62500 < aggroR2
      expect(targetScore(ux, uy, nearDrone, 0.12, aggroR2)).toBeLessThan(
        targetScore(ux, uy, farMothership, 0.12, aggroR2),
      );
    } finally {
      restore();
    }
  });
});
