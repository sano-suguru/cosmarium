import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { trailColor } from '../colors.ts';
import { particle, poolCounts, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import type { Team, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { buildHash } from './spatial-hash.ts';
import type { Killer } from './spawn.ts';
import { captureKiller, onKillUnit } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { addShake } from '../input/camera.ts';
import {
  boostBurst,
  boostTrail,
  CHAIN_DAMAGE_DECAY,
  chainLightning,
  destroyUnit,
  explosion,
  trail,
  updateChains,
} from './effects.ts';

const DUMMY_KILLER: Killer = { index: NO_UNIT as UnitIndex, team: 0, type: 0 };

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
    explosion(0, 0, 0, 0, NO_UNIT, rng);
    expect(poolCounts.particles).toBeGreaterThan(0);
  });

  it('大型ユニット (size>=14) → addShake が呼ばれる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cruiserType = unitType(3);
    explosion(0, 0, 0, 3, NO_UNIT, rng);
    expect(addShake).toHaveBeenCalledWith(cruiserType.size * 0.8, 0, 0);
  });

  it('小型ユニット (size<14) → addShake が呼ばれない', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // type 0 (Drone) は size=4
    explosion(0, 0, 0, 0, NO_UNIT, rng);
    expect(addShake).not.toHaveBeenCalled();
  });

  it('近くのユニットにノックバック適用 (vx/vy変化)', () => {
    const idx = spawnAt(0, 1, 30, 0);
    unit(idx).vx = 0;
    unit(idx).vy = 0;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 0, 0, NO_UNIT, rng);
    // ノックバックでvxが正方向に変化（ユニットは爆発の右側）
    expect(unit(idx).vx).toBeGreaterThan(0);
  });

  it('killer有効 → kills++ される', () => {
    const killer = spawnAt(0, 1, 100, 100);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(unit(killer).kills).toBe(0);
    explosion(0, 0, 1, 0, killer, rng);
    expect(unit(killer).kills).toBe(1);
  });

  it('kills >= 3 → vet=1', () => {
    const killer = spawnAt(0, 1, 100, 100);
    unit(killer).kills = 2;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer, rng);
    expect(unit(killer).kills).toBe(3);
    expect(unit(killer).vet).toBe(1);
  });

  it('kills >= 8 → vet=2', () => {
    const killer = spawnAt(0, 1, 100, 100);
    unit(killer).kills = 7;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    explosion(0, 0, 1, 0, killer, rng);
    expect(unit(killer).kills).toBe(8);
    expect(unit(killer).vet).toBe(2);
  });

  it('killer=-1 → vet処理スキップ', () => {
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // killer=-1 でエラーが起きないことを確認
    explosion(0, 0, 0, 0, NO_UNIT, rng);
    expect(poolCounts.particles).toBeGreaterThan(0);
  });
});

describe('trail', () => {
  it('パーティクルが1つ生成される', () => {
    const idx = spawnAt(0, 1, 50, 50);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const before = poolCounts.particles;
    trail(unit(idx), rng);
    expect(poolCounts.particles).toBe(before + 1);
  });
});

describe('chainLightning', () => {
  it('ターゲットなし → 何もしない', () => {
    buildHash();
    chainLightning(0, 0, 0, 10, 5, [1, 1, 1], DUMMY_KILLER, rng);
    expect(beams).toHaveLength(0);
    expect(poolCounts.particles).toBe(0);
  });

  it('1体の敵にビーム + ダメージ適用', () => {
    const enemy = spawnAt(1, 1, 50, 0); // team 1
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = unit(enemy).hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0], DUMMY_KILLER, rng);
    expect(beams).toHaveLength(1);
    // ch=0: damage * (1 - 0*CHAIN_DAMAGE_DECAY) = 4
    expect(unit(enemy).hp).toBe(hpBefore - 4);
  });

  it('連鎖ごとにダメージ12%減衰', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp1Before = unit(e1).hp;
    const hp2Before = unit(e2).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    // ch=0: 10 * (1 - 0*CHAIN_DAMAGE_DECAY) = 10
    expect(unit(e1).hp).toBeCloseTo(hp1Before - 10);
    updateChains(0.06, rng);
    // ch=1: 10 * (1 - 1*CHAIN_DAMAGE_DECAY) = 8.8
    expect(unit(e2).hp).toBeCloseTo(hp2Before - 10 * (1 - CHAIN_DAMAGE_DECAY));
    expect(beams).toHaveLength(2);
  });

  it('同ターゲットに2度連鎖しない (Set管理)', () => {
    // 1体だけの敵 → 1回だけヒット
    const enemy = spawnAt(1, 1, 50, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = unit(enemy).hp;
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0], DUMMY_KILLER, rng);
    // 1体しかいないので1回だけダメージ
    expect(unit(enemy).hp).toBe(hpBefore - 4);
    expect(beams).toHaveLength(1);
  });

  it('HP<=0 → killUnit + explosion（ユニットが死亡する）', () => {
    const enemy = spawnAt(1, 0, 50, 0); // type 0 (Drone), hp=3
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 100, 5, [1, 0, 0], DUMMY_KILLER, rng); // damage=100 > hp=3
    expect(unit(enemy).alive).toBe(false);
  });

  it('味方にはヒットしない', () => {
    const ally = spawnAt(0, 1, 50, 0); // team 0 (発射側と同チーム)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = unit(ally).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    expect(unit(ally).hp).toBe(hpBefore);
    expect(beams).toHaveLength(0);
  });

  it('遅延ダメージタイミング', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    const e3 = spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp1Before = unit(e1).hp;
    const hp2Before = unit(e2).hp;
    const hp3Before = unit(e3).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    expect(unit(e1).hp).toBeCloseTo(hp1Before - 10);
    expect(unit(e2).hp).toBe(hp2Before);
    expect(unit(e3).hp).toBe(hp3Before);
    updateChains(0.06, rng);
    expect(unit(e2).hp).toBeCloseTo(hp2Before - 10 * (1 - 1 * CHAIN_DAMAGE_DECAY));
    expect(unit(e3).hp).toBe(hp3Before);
    updateChains(0.06, rng);
    expect(unit(e3).hp).toBeCloseTo(hp3Before - 10 * (1 - 2 * CHAIN_DAMAGE_DECAY));
  });

  it('ビーム数の段階的増加', () => {
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    spawnAt(1, 1, 200, 0);
    spawnAt(1, 1, 250, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    expect(beams).toHaveLength(1);
    updateChains(0.06, rng);
    expect(beams).toHaveLength(2);
    updateChains(0.06, rng);
    expect(beams).toHaveLength(3);
    updateChains(0.06, rng);
    expect(beams).toHaveLength(4);
    updateChains(0.06, rng);
    expect(beams).toHaveLength(5);
  });

  it('死亡ターゲット処理', () => {
    spawnAt(1, 1, 50, 0);
    const e2 = spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hp2Before = unit(e2).hp;
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    unit(e2).alive = false;
    updateChains(0.06, rng);
    expect(unit(e2).hp).toBe(hp2Before);
    expect(beams).toHaveLength(2);
  });

  it('チェインクリーンアップ', () => {
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    updateChains(0.2, rng);
    updateChains(0.2, rng);
    updateChains(0.2, rng);
    updateChains(0.2, rng);
    updateChains(0.2, rng);
    expect(beams).toHaveLength(3);
    resetState();
  });

  it('ターゲット0体で pendingChains にエントリなし', () => {
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    updateChains(0.1, rng);
    expect(beams).toHaveLength(0);
  });

  it('ビームの lightning フラグ', () => {
    spawnAt(1, 1, 50, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], DUMMY_KILLER, rng);
    expect(beams[0]?.lightning).toBe(true);
  });

  it('遅延ホップのビーム起点が前ターゲットのライブ座標を使う', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0], DUMMY_KILLER, rng);
    unit(e1).x = 999;
    unit(e1).y = 888;
    updateChains(0.06, rng);
    expect(beams[1]?.x1).toBe(999);
    expect(beams[1]?.y1).toBe(888);
  });

  it('前ターゲット死亡時はフォールバック座標を使う', () => {
    const e1 = spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 4, 5, [1, 0, 0], DUMMY_KILLER, rng);
    const snapshotX = unit(e1).x;
    const snapshotY = unit(e1).y;
    unit(e1).alive = false;
    unit(e1).x = 999;
    updateChains(0.06, rng);
    expect(beams[1]?.x1).toBe(snapshotX);
    expect(beams[1]?.y1).toBe(snapshotY);
  });
});

describe('boostBurst', () => {
  it('パーティクルが10個生成される', () => {
    state.rng = () => 0.5;
    const idx = spawnAt(0, 0, 100, 100);
    const before = poolCounts.particles;
    boostBurst(unit(idx), rng);
    expect(poolCounts.particles).toBe(before + 10);
  });

  it('パーティクルのライフが0.3s以下（rng最大値）', () => {
    state.rng = () => 0.999;
    const idx = spawnAt(0, 0, 100, 100);
    boostBurst(unit(idx), rng);
    // life = 0.15 + 0.999 * 0.1 = 0.2499
    for (let i = 0; i < 10; i++) {
      const p = particle(i);
      if (p.alive) {
        expect(p.life).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('明るいトレイルカラー使用', () => {
    state.rng = () => 0.5;
    const idx = spawnAt(0, 0, 100, 100);
    boostBurst(unit(idx), rng);
    const team: Team = 0;
    const tc = trailColor(0, team);
    const bright = [tc[0] + (1 - tc[0]) * 0.5, tc[1] + (1 - tc[1]) * 0.5, tc[2] + (1 - tc[2]) * 0.5] as const;
    const p = particle(0);
    expect(p.r).toBeCloseTo(bright[0], 2);
    expect(p.g).toBeCloseTo(bright[1], 2);
    expect(p.b).toBeCloseTo(bright[2], 2);
  });
});

describe('boostTrail', () => {
  it('rng < 閾値でパーティクルが1個生成される', () => {
    state.rng = () => 0.0;
    const idx = spawnAt(0, 0, 100, 100);
    const before = poolCounts.particles;
    boostTrail(unit(idx), 1 / 30, rng);
    // rng()=0.0 < 1 - 0.6^1 ≈ 0.4 → spawn
    expect(poolCounts.particles).toBe(before + 1);
  });

  it('rng >= 閾値でパーティクルが生成されない', () => {
    state.rng = () => 0.99;
    const idx = spawnAt(0, 0, 100, 100);
    const before = poolCounts.particles;
    boostTrail(unit(idx), 1 / 30, rng);
    // rng()=0.99 >= 0.4 → スキップ
    expect(poolCounts.particles).toBe(before);
  });

  it('パーティクルがユニット背面に生成される', () => {
    state.rng = () => 0.0;
    const idx = spawnAt(0, 0, 200, 200);
    const u = unit(idx);
    u.angle = 0; // cos(0)=1, sin(0)=0
    boostTrail(u, 1 / 30, rng);
    const p = particle(0);
    // ox = 200 - 1 * 4 * 0.8 + (0 - 0.5) * 4 * 0.5 = 200 - 3.2 - 1.0 = 195.8
    expect(p.x).toBeLessThan(u.x);
  });

  it('パーティクルのライフが0.3s以下', () => {
    state.rng = () => 0.0;
    const idx = spawnAt(0, 0, 100, 100);
    boostTrail(unit(idx), 1 / 30, rng);
    const p = particle(0);
    // life = 0.08 + rng() * 0.12 = 0.08 (rng=0)
    expect(p.life).toBeLessThanOrEqual(0.3);
  });
});

describe('chainLightning — KillEvent 伝播', () => {
  it('即時ホップ kill 時に sourceKiller が KillEvent に伝播される', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const attacker = spawnAt(0, 14, 100, 100); // Arcer (type=14)
    const enemy = spawnAt(1, 0, 50, 0); // Drone (hp=3)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 100, 5, [1, 0, 0], captureKiller(attacker), rng);
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(14);
  });

  it('遅延ホップ kill 時に sourceKiller が KillEvent に伝播される', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const attacker = spawnAt(0, 14, 100, 100); // Arcer (type=14)
    spawnAt(1, 1, 50, 0); // 即時ホップ対象 (Fighter hp=10, 生存)
    const enemy2 = spawnAt(1, 0, 100, 0); // 遅延ホップ対象 (Drone hp=3)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    chainLightning(0, 0, 0, 100, 5, [1, 0, 0], captureKiller(attacker), rng);
    updateChains(0.06, rng);
    expect(unit(enemy2).alive).toBe(false);
    const killEvents = events.filter((e) => e.killerTeam !== undefined);
    expect(killEvents.length).toBeGreaterThanOrEqual(1);
    const lastKill = killEvents[killEvents.length - 1];
    expect(lastKill?.killerTeam).toBe(0);
    expect(lastKill?.killerType).toBe(14);
  });
});

describe('killUnitWithExplosion', () => {
  it('alive ユニットをkillしてexplosionパーティクルを生成する', () => {
    const idx = spawnAt(0, 1, 100, 200);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(unit(idx).alive).toBe(true);
    expect(poolCounts.particles).toBe(0);
    destroyUnit(idx, NO_UNIT, rng, KILL_CONTEXT.ProjectileDirect);
    expect(unit(idx).alive).toBe(false);
    expect(poolCounts.particles).toBeGreaterThan(0);
  });

  it('dead ユニットに対して explosion をスキップする（パーティクル 0 個）', () => {
    const idx = spawnAt(0, 1, 100, 200);
    buildHash();
    // まず kill してから dead ユニットに対して呼ぶ
    destroyUnit(idx, NO_UNIT, rng, KILL_CONTEXT.ProjectileDirect);
    const particlesAfterFirst = poolCounts.particles;
    // 2 回目: dead ユニットに対して呼ぶ → explosion がスキップされる
    destroyUnit(idx, NO_UNIT, rng, KILL_CONTEXT.ProjectileDirect);
    expect(poolCounts.particles).toBe(particlesAfterFirst); // 追加なし
  });
});
