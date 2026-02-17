import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { getUnit, poolCounts } from '../pools.ts';
import { beams } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { addShake } from '../input/camera.ts';
import { chainLightning, explosion, trail, updatePendingChains } from './effects.ts';

afterEach(() => {
  resetPools();
  resetState();
  // vi.mock() ファクトリで作成した vi.fn() の呼び出し履歴は restoreAllMocks ではクリアされないため必要
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('explosion', () => {
  it('パーティクルが生成される', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 0, 0, NO_UNIT);
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });

  it('大型ユニット (size>=14) → addShake が呼ばれる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // type 3 (Cruiser) は size=15
    explosion(0, 0, 0, 3, NO_UNIT);
    expect(addShake).toHaveBeenCalledWith(15 * 0.8);
  });

  it('小型ユニット (size<14) → addShake が呼ばれない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // type 0 (Drone) は size=4
    explosion(0, 0, 0, 0, NO_UNIT);
    expect(addShake).not.toHaveBeenCalled();
  });

  it('近くのユニットにノックバック適用 (vx/vy変化)', () => {
    const idx = spawnAt(0, 1, 30, 0);
    getUnit(idx).vx = 0;
    getUnit(idx).vy = 0;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 0, 0, NO_UNIT);
    // ノックバックでvxが正方向に変化（ユニットは爆発の右側）
    expect(getUnit(idx).vx).toBeGreaterThan(0);
  });

  it('killer有効 → kills++ される', () => {
    const killer = spawnAt(0, 1, 100, 100);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(getUnit(killer).kills).toBe(0);
    explosion(0, 0, 1, 0, killer);
    expect(getUnit(killer).kills).toBe(1);
  });

  it('kills >= 3 → vet=1', () => {
    const killer = spawnAt(0, 1, 100, 100);
    getUnit(killer).kills = 2;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer);
    expect(getUnit(killer).kills).toBe(3);
    expect(getUnit(killer).vet).toBe(1);
  });

  it('kills >= 8 → vet=2', () => {
    const killer = spawnAt(0, 1, 100, 100);
    getUnit(killer).kills = 7;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer);
    expect(getUnit(killer).kills).toBe(8);
    expect(getUnit(killer).vet).toBe(2);
  });

  it('killer=-1 → vet処理スキップ', () => {
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // killer=-1 でエラーが起きないことを確認
    explosion(0, 0, 0, 0, NO_UNIT);
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });
});

describe('trail', () => {
  it('パーティクルが1つ生成される', () => {
    const idx = spawnAt(0, 1, 50, 50);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const before = poolCounts.particleCount;
    trail(getUnit(idx));
    expect(poolCounts.particleCount).toBe(before + 1);
  });
});

describe('chainLightning', () => {
  it('ターゲットなし → 何もしない', () => {
    buildHash();
    chainLightning(0, 0, 0, 10, 5, [1, 1, 1]);
    expect(beams).toHaveLength(0);
    expect(poolCounts.particleCount).toBe(0);
  });

  it('1体の敵にビーム + ダメージ適用', () => {
    const enemy = spawnAt(1, 1, 50, 0); // team 1
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(enemy).hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    expect(beams).toHaveLength(1);
    // ch=0: damage * (1 - 0*0.12) = 4
    expect(getUnit(enemy).hp).toBe(hpBefore - 4);
  });

  it('連鎖ごとにダメージ12%減衰', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp1Before = getUnit(e1).hp;
    const hp2Before = getUnit(e2).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    // ch=0: 10 * (1 - 0*0.12) = 10
    expect(getUnit(e1).hp).toBeCloseTo(hp1Before - 10);
    updatePendingChains(0.06);
    // ch=1: 10 * (1 - 1*0.12) = 8.8
    expect(getUnit(e2).hp).toBeCloseTo(hp2Before - 8.8);
    expect(beams).toHaveLength(2);
  });

  it('同ターゲットに2度連鎖しない (Set管理)', () => {
    // 1体だけの敵 → 1回だけヒット
    const enemy = spawnAt(1, 1, 50, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(enemy).hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    // 1体しかいないので1回だけダメージ
    expect(getUnit(enemy).hp).toBe(hpBefore - 4);
    expect(beams).toHaveLength(1);
  });

  it('HP<=0 → killUnit + explosion（ユニットが死亡する）', () => {
    const enemy = spawnAt(1, 0, 50, 0); // type 0 (Drone), hp=3
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 100, 5, [1, 0, 0]); // damage=100 > hp=3
    expect(getUnit(enemy).alive).toBe(false);
  });

  it('味方にはヒットしない', () => {
    const ally = spawnAt(0, 1, 50, 0); // team 0 (発射側と同チーム)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(ally).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    expect(getUnit(ally).hp).toBe(hpBefore);
    expect(beams).toHaveLength(0);
  });

  it('遅延ダメージタイミング', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    const e3 = spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp1Before = getUnit(e1).hp;
    const hp2Before = getUnit(e2).hp;
    const hp3Before = getUnit(e3).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    expect(getUnit(e1).hp).toBeCloseTo(hp1Before - 10);
    expect(getUnit(e2).hp).toBe(hp2Before);
    expect(getUnit(e3).hp).toBe(hp3Before);
    updatePendingChains(0.06);
    expect(getUnit(e2).hp).toBeCloseTo(hp2Before - 8.8);
    expect(getUnit(e3).hp).toBe(hp3Before);
    updatePendingChains(0.06);
    expect(getUnit(e3).hp).toBeCloseTo(hp3Before - 7.6);
  });

  it('ビーム数の段階的増加', () => {
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    spawnAt(1, 1, 200, 0);
    spawnAt(1, 1, 250, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    expect(beams).toHaveLength(1);
    updatePendingChains(0.06);
    expect(beams).toHaveLength(2);
    updatePendingChains(0.06);
    expect(beams).toHaveLength(3);
    updatePendingChains(0.06);
    expect(beams).toHaveLength(4);
    updatePendingChains(0.06);
    expect(beams).toHaveLength(5);
  });

  it('死亡ターゲット処理', () => {
    spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp2Before = getUnit(e2).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    getUnit(e2).alive = false;
    updatePendingChains(0.06);
    expect(getUnit(e2).hp).toBe(hp2Before);
    expect(beams).toHaveLength(2);
  });

  it('チェインクリーンアップ', () => {
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    updatePendingChains(0.2);
    updatePendingChains(0.2);
    updatePendingChains(0.2);
    updatePendingChains(0.2);
    updatePendingChains(0.2);
    expect(beams).toHaveLength(3);
    resetState();
  });

  it('ターゲット0体で pendingChains にエントリなし', () => {
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    updatePendingChains(0.1);
    expect(beams).toHaveLength(0);
  });

  it('ビームの lightning フラグ', () => {
    spawnAt(1, 1, 50, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    expect(beams[0]?.lightning).toBe(true);
  });

  it('遅延ホップのビーム起点が前ターゲットのライブ座標を使う', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    getUnit(e1).x = 999;
    getUnit(e1).y = 888;
    updatePendingChains(0.06);
    expect(beams[1]?.x1).toBe(999);
    expect(beams[1]?.y1).toBe(888);
  });

  it('前ターゲット死亡時はフォールバック座標を使う', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    const snapshotX = getUnit(e1).x;
    const snapshotY = getUnit(e1).y;
    getUnit(e1).alive = false;
    getUnit(e1).x = 999;
    updatePendingChains(0.06);
    expect(beams[1]?.x1).toBe(snapshotX);
    expect(beams[1]?.y1).toBe(snapshotY);
  });
});
