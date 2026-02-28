import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat } from './combat.ts';
import { aimAt } from './combat-aim.ts';
import { resetReflected } from './combat-reflect.ts';
import { _resetSweepHits } from './combat-sweep.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('aimAt — 偏差射撃の照準計算', () => {
  it('静止目標 → 直射角度と同じ', () => {
    const aim = aimAt(0, 0, 100, 0, 0, 0, 500, 1.0);
    expect(aim.ang).toBeCloseTo(0); // 右方向
    expect(aim.dist).toBeCloseTo(100);
  });

  it('accuracy=0 → 常に直射', () => {
    const aim = aimAt(0, 0, 100, 0, 0, 200, 500, 0);
    expect(aim.ang).toBeCloseTo(0);
    expect(aim.dist).toBeCloseTo(100);
  });

  it('移動目標 (上方) → 角度が正方向にずれる', () => {
    // 目標: (100, 0) が (0, 200) の速度で上に移動
    const aim = aimAt(0, 0, 100, 0, 0, 200, 500, 1.0);
    expect(aim.ang).toBeGreaterThan(0); // 上方向にリード
    expect(aim.ang).toBeLessThan(Math.PI / 2); // 90度未満
  });

  it('移動目標 (下方) → 角度が負方向にずれる', () => {
    const aim = aimAt(0, 0, 100, 0, 0, -200, 500, 1.0);
    expect(aim.ang).toBeLessThan(0);
  });

  it('accuracy=0.5 → 直射とフルリードの中間', () => {
    // aimAt はシングルトンを返すが、.ang でプリミティブを即時取得するため安全
    const directAng = aimAt(0, 0, 100, 0, 0, 200, 500, 0).ang;
    const fullAng = aimAt(0, 0, 100, 0, 0, 200, 500, 1.0).ang;
    const halfAng = aimAt(0, 0, 100, 0, 0, 200, 500, 0.5).ang;
    expect(halfAng).toBeGreaterThan(directAng);
    expect(halfAng).toBeLessThan(fullAng);
  });

  it('到達不能 (目標が弾より速い) → 直射にフォールバック', () => {
    // 弾速10で、目標速度500の場合
    const aim = aimAt(0, 0, 100, 0, 500, 0, 10, 1.0);
    const directAng = Math.atan2(0, 100);
    expect(aim.ang).toBeCloseTo(directAng);
  });

  it('speed=0 → 直射にフォールバック', () => {
    const aim = aimAt(0, 0, 100, 50, 0, 200, 0, 1.0);
    expect(aim.ang).toBeCloseTo(Math.atan2(50, 100));
  });

  it('距離0の目標 → 角度0、距離0', () => {
    const aim = aimAt(50, 50, 50, 50, 100, 100, 500, 1.0);
    expect(aim.dist).toBeCloseTo(0);
  });

  it('完全予測: 弾が予測位置に同時到着する', () => {
    // 目標: (200, 0) が (0, 100) で上方向に移動、弾速500
    const aim = aimAt(0, 0, 200, 0, 0, 100, 500, 1.0);
    // t = aim.dist / 500 (飛翔時間)
    const t = aim.dist / 500;
    // 予測目標位置: (200, 100*t)
    const predictedX = 200;
    const predictedY = 100 * t;
    // 弾の着弾位置: (cos(ang)*500*t, sin(ang)*500*t)
    const bulletX = Math.cos(aim.ang) * 500 * t;
    const bulletY = Math.sin(aim.ang) * 500 * t;
    expect(bulletX).toBeCloseTo(predictedX, 0);
    expect(bulletY).toBeCloseTo(predictedY, 0);
  });
});

describe('combat — 偏差射撃統合', () => {
  it('Fighter: 移動目標への射撃角度が直射角度と異なる (leadAccuracy=0.7)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(enemy).vy = 200; // 上に移動中
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    // vy > 0 → 弾のvy成分が正方向にずれる（上を狙う）
    const p = projectile(0);
    expect(p.vy).toBeGreaterThan(0);
  });

  it('Fighter: 静止目標への射撃は直射と同等', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(enemy).vx = 0;
    unit(enemy).vy = 0;
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    const p = projectile(0);
    // 直射方向は +x なので vy ≈ 0 (u.vy*0.3 分の微小オフセットのみ)
    expect(Math.abs(p.vy)).toBeLessThan(1);
  });

  it('Sniper: ヒットスキャンで射線上の敵に即着弾', () => {
    const sniper = spawnAt(0, 8, 0, 0);
    const enemy = spawnAt(1, 1, 300, 0);
    unit(sniper).cooldown = 0;
    unit(sniper).target = enemy;
    buildHash();
    combat(unit(sniper), sniper, 0.016, 0, rng);
    // ヒットスキャンなのでプロジェクタイルは生成されない
    expect(poolCounts.projectiles).toBe(0);
    // 敵にダメージが入る
    expect(unit(enemy).hp).toBeLessThan(unit(enemy).maxHp);
  });

  it('Reflector: 弱射撃にも偏差が適用される (leadAccuracy=0.15)', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    unit(enemy).vy = 300;
    unit(reflector).cooldown = 0;
    unit(reflector).target = enemy;
    buildHash();
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    const p = projectile(0);
    // leadAccuracy=0.15 なのでわずかに上方向にずれる
    expect(p.vy).toBeGreaterThan(0);
  });

  it('Flagship: チャージ時のロック角度に偏差が適用される (leadAccuracy=0.85)', () => {
    const flagship = spawnAt(0, 4, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(enemy).vy = 150;
    unit(flagship).cooldown = 0;
    unit(flagship).target = enemy;
    buildHash();
    combat(unit(flagship), flagship, 0.016, 0, rng);
    // チャージ開始 → sweepBaseAngle が直射 (0) より正方向にずれている
    expect(unit(flagship).sweepBaseAngle).toBeGreaterThan(0);
  });
});
