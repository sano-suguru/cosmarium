import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { WORLD_SIZE } from '../constants.ts';
import { getUnit } from '../pools.ts';
import { state } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { steer } from './steering.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('steer — スタン', () => {
  it('stun>0 → 速度0.93倍減衰、stun-=dt、位置更新', () => {
    const idx = spawnAt(0, 1, 100, 100);
    const u = getUnit(idx);
    u.stun = 1.0;
    u.vx = 100;
    u.vy = 50;
    const xBefore = u.x;
    const yBefore = u.y;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    steer(u, 0.016);
    expect(u.stun).toBeCloseTo(1.0 - 0.016);
    expect(u.vx).toBeCloseTo(100 * 0.93);
    expect(u.vy).toBeCloseTo(50 * 0.93);
    // 位置は更新される（vx * dt 分移動）
    expect(u.x).toBeGreaterThan(xBefore);
    expect(u.y).toBeGreaterThan(yBefore);
  });

  it('stun>0 → 通常操舵ロジックは実行されない（早期return）', () => {
    const idx = spawnAt(0, 1, 100, 100);
    const u = getUnit(idx);
    u.stun = 0.5;
    u.target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const angBefore = u.angle;
    steer(u, 0.016);
    // angle はスタン中変化しない
    expect(u.angle).toBe(angBefore);
  });
});

describe('steer — ベテラン速度', () => {
  it('vet=0 → spd×1.0', () => {
    const idx = spawnAt(0, 1, 0, 0);
    const u = getUnit(idx);
    u.vet = 0;
    u.angle = 0;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // 長めのdtで速度を安定させる
    for (let i = 0; i < 100; i++) steer(u, 0.033);
    const spd = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
    const t = getUnitType(1);
    // vet=0の目標速度はspd * 1.0
    expect(spd).toBeGreaterThan(0);
    expect(spd).toBeLessThanOrEqual(t.speed * 1.1); // マージン含む
  });

  it('vet=2 → vet=0 より速い', () => {
    // vet=0
    const i0 = spawnAt(0, 1, 0, 0);
    const u0 = getUnit(i0);
    u0.vet = 0;
    u0.angle = 0;

    // vet=2
    const i2 = spawnAt(0, 1, 500, 500); // 離れた位置
    const u2 = getUnit(i2);
    u2.vet = 2;
    u2.angle = 0;

    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 100; i++) {
      steer(u0, 0.033);
      steer(u2, 0.033);
    }
    const spd0 = Math.sqrt(u0.vx * u0.vx + u0.vy * u0.vy);
    const spd2 = Math.sqrt(u2.vx * u2.vx + u2.vy * u2.vy);
    expect(spd2).toBeGreaterThan(spd0);
  });
});

describe('steer — ターゲット探索', () => {
  it('近傍の敵を最短距離でターゲット', () => {
    const ally = spawnAt(0, 1, 0, 0);
    const nearEnemy = spawnAt(1, 1, 80, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    steer(getUnit(ally), 0.016);
    expect(getUnit(ally).target).toBe(nearEnemy);
  });

  it('死亡ターゲットクリア: tgt先がalive=false → tgt=-1', () => {
    const ally = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 80, 0);
    getUnit(ally).target = enemy;
    getUnit(enemy).alive = false;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    steer(getUnit(ally), 0.016);
    // 死亡ターゲットはクリアされるべき
    // 新しいターゲットが見つからない場合は -1
    // (enemy is dead, so no valid targets nearby)
    expect(getUnit(ally).target).toBe(NO_UNIT);
  });
});

describe('steer — RAM型', () => {
  it('RAM型はターゲットに向かって強い力で突進', () => {
    const ram = spawnAt(0, 9, 0, 0); // type 9 = Ram
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(ram).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    steer(getUnit(ram), 0.033);
    // ターゲットはx正方向なので、vxが正方向に増加
    expect(getUnit(ram).vx).toBeGreaterThan(0);
  });
});

describe('steer — Mode 2 フォールバック', () => {
  it('tgt<0 → 敵基地方向に力', () => {
    state.gameMode = 2;
    const ally = spawnAt(0, 1, 0, 0); // team 0 → 敵基地 = bases[1] (x=1800)
    getUnit(ally).target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 50; i++) steer(getUnit(ally), 0.033);
    // team 0 → bases[1].x = 1800 なので右方向に移動
    expect(getUnit(ally).x).toBeGreaterThan(0);
  });

  it('team=1 → bases[0] (x=-1800) 方向に力', () => {
    state.gameMode = 2;
    const ally = spawnAt(1, 1, 0, 0); // team 1 → 敵基地 = bases[0] (x=-1800)
    getUnit(ally).target = NO_UNIT;
    // wanderAngle=PI にして wandering force を左方向に揃え、Mode2力と干渉しない
    getUnit(ally).wanderAngle = Math.PI;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 50; i++) steer(getUnit(ally), 0.033);
    // team 1 → bases[0].x = -1800 なので左方向に移動
    expect(getUnit(ally).x).toBeLessThan(0);
  });
});

describe('steer — ヒーラー追従', () => {
  it('heals=true → 最大mass味方に追従', () => {
    const healer = spawnAt(0, 5, 0, 0); // type 5 = Healer
    spawnAt(0, 4, 100, 0); // type 4 = Flagship (mass=30)
    spawnAt(0, 0, -100, 0); // type 0 = Drone (mass=1)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 30; i++) steer(getUnit(healer), 0.033);
    // Flagship (x=100) 方向に引き寄せ → xが正方向に移動
    expect(getUnit(healer).x).toBeGreaterThan(0);
  });
});

describe('steer — ワールド境界', () => {
  it('|x| > WORLD_SIZE*0.8 → 内向き力', () => {
    const idx = spawnAt(0, 1, WORLD_SIZE * 0.85, 0);
    const u = getUnit(idx);
    u.vx = 0;
    u.vy = 0;
    u.target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 30; i++) steer(u, 0.033);
    // 境界の外側にいるので内側（左方向）に力
    expect(u.x).toBeLessThan(WORLD_SIZE * 0.85);
  });

  it('|y| > WORLD_SIZE*0.8 → 内向き力', () => {
    const idx = spawnAt(0, 1, 0, -WORLD_SIZE * 0.85);
    const u = getUnit(idx);
    u.vx = 0;
    u.vy = 0;
    u.target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (let i = 0; i < 30; i++) steer(u, 0.033);
    // y < -WORLD_SIZE*0.8 なので上方向（yが増える方向）に力
    expect(u.y).toBeGreaterThan(-WORLD_SIZE * 0.85);
  });
});
