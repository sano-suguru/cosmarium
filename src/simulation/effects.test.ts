import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts, uP } from '../pools.ts';
import { beams } from '../state.ts';
import { bHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, tz: 1, tx: 0, ty: 0, shkx: 0, shky: 0, shk: 0 },
  initCamera: vi.fn(),
}));

import { addShake } from '../input/camera.ts';
import { chainLightning, explosion, trail } from './effects.ts';

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
    explosion(0, 0, 0, 0, -1);
    expect(poolCounts.pC).toBeGreaterThan(0);
  });

  it('大型ユニット (sz>=14) → addShake が呼ばれる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // type 3 (Cruiser) は sz=15
    explosion(0, 0, 0, 3, -1);
    expect(addShake).toHaveBeenCalledWith(15 * 0.8);
  });

  it('小型ユニット (sz<14) → addShake が呼ばれない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // type 0 (Drone) は sz=4
    explosion(0, 0, 0, 0, -1);
    expect(addShake).not.toHaveBeenCalled();
  });

  it('近くのユニットにノックバック適用 (vx/vy変化)', () => {
    const idx = spawnAt(0, 1, 30, 0);
    uP[idx]!.vx = 0;
    uP[idx]!.vy = 0;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 0, 0, -1);
    // ノックバックでvxが正方向に変化（ユニットは爆発の右側）
    expect(uP[idx]!.vx).toBeGreaterThan(0);
  });

  it('killer有効 → kills++ される', () => {
    const killer = spawnAt(0, 1, 100, 100);
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(uP[killer]!.kills).toBe(0);
    explosion(0, 0, 1, 0, killer);
    expect(uP[killer]!.kills).toBe(1);
  });

  it('kills >= 3 → vet=1', () => {
    const killer = spawnAt(0, 1, 100, 100);
    uP[killer]!.kills = 2;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer);
    expect(uP[killer]!.kills).toBe(3);
    expect(uP[killer]!.vet).toBe(1);
  });

  it('kills >= 8 → vet=2', () => {
    const killer = spawnAt(0, 1, 100, 100);
    uP[killer]!.kills = 7;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer);
    expect(uP[killer]!.kills).toBe(8);
    expect(uP[killer]!.vet).toBe(2);
  });

  it('killer=-1 → vet処理スキップ', () => {
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // killer=-1 でエラーが起きないことを確認
    explosion(0, 0, 0, 0, -1);
    expect(poolCounts.pC).toBeGreaterThan(0);
  });
});

describe('trail', () => {
  it('パーティクルが1つ生成される', () => {
    const idx = spawnAt(0, 1, 50, 50);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const before = poolCounts.pC;
    trail(uP[idx]!);
    expect(poolCounts.pC).toBe(before + 1);
  });
});

describe('chainLightning', () => {
  it('ターゲットなし → 何もしない', () => {
    bHash();
    chainLightning(0, 0, 0, 10, 5, [1, 1, 1]);
    expect(beams).toHaveLength(0);
    expect(poolCounts.pC).toBe(0);
  });

  it('1体の敵にビーム + ダメージ適用', () => {
    const enemy = spawnAt(1, 1, 50, 0); // team 1
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[enemy]!.hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    expect(beams).toHaveLength(1);
    // ch=0: dmg * (1 - 0*0.12) = 4
    expect(uP[enemy]!.hp).toBe(hpBefore - 4);
  });

  it('連鎖ごとにダメージ12%減衰', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp1Before = uP[e1]!.hp;
    const hp2Before = uP[e2]!.hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    // ch=0: 10 * (1 - 0*0.12) = 10
    expect(uP[e1]!.hp).toBeCloseTo(hp1Before - 10);
    // ch=1: 10 * (1 - 1*0.12) = 8.8
    expect(uP[e2]!.hp).toBeCloseTo(hp2Before - 8.8);
    expect(beams).toHaveLength(2);
  });

  it('同ターゲットに2度連鎖しない (Set管理)', () => {
    // 1体だけの敵 → 1回だけヒット
    const enemy = spawnAt(1, 1, 50, 0);
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[enemy]!.hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0]);
    // 1体しかいないので1回だけダメージ
    expect(uP[enemy]!.hp).toBe(hpBefore - 4);
    expect(beams).toHaveLength(1);
  });

  it('HP<=0 → killU + explosion（ユニットが死亡する）', () => {
    const enemy = spawnAt(1, 0, 50, 0); // type 0 (Drone), hp=3
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 100, 5, [1, 0, 0]); // dmg=100 > hp=3
    expect(uP[enemy]!.alive).toBe(false);
  });

  it('味方にはヒットしない', () => {
    const ally = spawnAt(0, 1, 50, 0); // team 0 (発射側と同チーム)
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[ally]!.hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0]);
    expect(uP[ally]!.hp).toBe(hpBefore);
    expect(beams).toHaveLength(0);
  });
});
