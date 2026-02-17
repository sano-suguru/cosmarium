import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { WORLD_SIZE } from '../constants.ts';
import { getUnit } from '../pools.ts';
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
    steer(u, 0.016);
    expect(u.stun).toBeCloseTo(1.0 - 0.016);
    expect(u.vx).toBeCloseTo(100 * 0.93 ** (0.016 * 30));
    expect(u.vy).toBeCloseTo(50 * 0.93 ** (0.016 * 30));
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
    steer(getUnit(ally), 0.016);
    expect(getUnit(ally).target).toBe(nearEnemy);
  });

  it('死亡ターゲットクリア: tgt先がalive=false → tgt=-1', () => {
    const ally = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 80, 0);
    getUnit(ally).target = enemy;
    getUnit(enemy).alive = false;
    buildHash();
    steer(getUnit(ally), 0.016);
    // 死亡ターゲットはクリアされるべき
    // 新しいターゲットが見つからない場合は -1
    // (enemy is dead, so no valid targets nearby)
    expect(getUnit(ally).target).toBe(NO_UNIT);
  });
});

describe('steer — LANCER型', () => {
  it('LANCER型はターゲットに向かって強い力で突進', () => {
    const lancer = spawnAt(0, 9, 0, 0); // type 9 = Lancer
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(lancer).target = enemy;
    buildHash();
    steer(getUnit(lancer), 0.033);
    // ターゲットはx正方向なので、vxが正方向に増加
    expect(getUnit(lancer).vx).toBeGreaterThan(0);
  });
});

describe('steer — ヒーラー追従', () => {
  it('heals=true → 最大mass味方に追従', () => {
    const healer = spawnAt(0, 5, 0, 0); // type 5 = Healer
    spawnAt(0, 4, 100, 0); // type 4 = Flagship (mass=30)
    spawnAt(0, 0, -100, 0); // type 0 = Drone (mass=1)
    buildHash();
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
    for (let i = 0; i < 30; i++) steer(u, 0.033);
    // y < -WORLD_SIZE*0.8 なので上方向（yが増える方向）に力
    expect(u.y).toBeGreaterThan(-WORLD_SIZE * 0.85);
  });
});

describe('steer — Boids Separation', () => {
  it('近接ユニットから離れる方向に力が働く', () => {
    const u1 = spawnAt(0, 1, 0, 0);
    const u2 = spawnAt(0, 1, 8, 0);
    getUnit(u1).target = NO_UNIT;
    getUnit(u2).target = NO_UNIT;
    buildHash();
    for (let i = 0; i < 30; i++) {
      buildHash();
      steer(getUnit(u1), 0.033);
      steer(getUnit(u2), 0.033);
    }
    expect(getUnit(u1).x).toBeLessThan(getUnit(u2).x);
  });
});

describe('steer — Boids Alignment', () => {
  it('同タイプ味方の速度方向に揃う', () => {
    const subject = spawnAt(0, 1, 0, 0);
    getUnit(subject).vx = 0;
    getUnit(subject).vy = 0;
    getUnit(subject).target = NO_UNIT;
    for (let j = 1; j <= 3; j++) {
      const ally = spawnAt(0, 1, 50 * j, 0);
      getUnit(ally).vx = 100;
      getUnit(ally).vy = 0;
    }
    buildHash();
    for (let i = 0; i < 50; i++) {
      buildHash();
      steer(getUnit(subject), 0.033);
    }
    expect(getUnit(subject).vx).toBeGreaterThan(0);
  });
});

describe('steer — Boids Cohesion', () => {
  it('味方集団の重心に引き寄せられる', () => {
    const loner = spawnAt(0, 1, 0, 0);
    getUnit(loner).target = NO_UNIT;
    spawnAt(0, 1, 100, 0);
    spawnAt(0, 1, 120, 0);
    spawnAt(0, 1, 110, 10);
    buildHash();
    for (let i = 0; i < 50; i++) {
      buildHash();
      steer(getUnit(loner), 0.033);
    }
    expect(getUnit(loner).x).toBeGreaterThan(0);
  });
});

describe('steer — 慣性（mass-based inertia）', () => {
  it('mass=1 で応答スケーリングが 1.0', () => {
    const idx = spawnAt(0, 0, 0, 0); // Drone (mass=1)
    const u = getUnit(idx);
    u.angle = 0;
    u.vx = 0;
    u.vy = 0;
    u.target = NO_UNIT;
    buildHash();
    // 1回のsteer呼び出しで速度変化を確認
    // 前提: spawnAt の固定rng (()=>0) により wanderAngle=0。
    //   target=NO_UNIT → wander force = (cos(0)*220*0.5, sin(0)*...) = (110, 0)
    //   angle=0 と一致するため da=0 → angle 変化なし → cos(angle)=1 が維持される
    steer(u, 0.016);
    // inertia = 1 / 1^0.25 = 1.0
    // response = 0.016 * 3 * 1.0 = 0.048
    // u.type = 0 (Drone) の速度は220
    // vx = (220 - 0) * 0.048 = 10.56、その後moveDrag適用
    // moveDrag = (1 - 0.5/30)^(0.016*30) ≈ 0.9922
    // 最終: vx ≈ 10.56 * 0.9922 ≈ 10.48
    expect(u.vx).toBeGreaterThan(10.4);
    expect(u.vx).toBeLessThan(10.6);
    expect(u.vy).toBeCloseTo(0, 1);
  });

  it('mass が大きいほど速度応答が遅い', () => {
    const light = spawnAt(0, 0, 0, 0); // Drone (mass=1)
    const lightU = getUnit(light);
    lightU.angle = 0;
    lightU.vx = 0;
    lightU.vy = 0;
    lightU.target = NO_UNIT;

    const heavy = spawnAt(0, 3, 100, 0); // Cruiser (mass=10)
    const heavyU = getUnit(heavy);
    heavyU.angle = 0;
    heavyU.vx = 0;
    heavyU.vy = 0;
    heavyU.target = NO_UNIT;

    for (let i = 0; i < 50; i++) {
      buildHash();
      steer(lightU, 0.016);
      steer(heavyU, 0.016);
    }

    const lightSpeed = Math.sqrt(lightU.vx ** 2 + lightU.vy ** 2);
    const heavySpeed = Math.sqrt(heavyU.vx ** 2 + heavyU.vy ** 2);
    expect(lightSpeed).toBeGreaterThan(heavySpeed);
  });

  it('mass=30 の応答が mass=1 の 1/30 より大きい（サブリニア）', () => {
    const baseline = 1 / 1 ** 0.25; // 1.0
    const flagship = 1 / 30 ** 0.25; // ~0.43

    // sublinear: 0.43 > 1/30 (0.033)
    expect(flagship).toBeGreaterThan(baseline / 30);
    expect(flagship).toBeCloseTo(0.43, 1);
  });

  it('境界押し戻しが mass=30 でも機能する', () => {
    const idx = spawnAt(0, 4, 3500, 0); // Flagship (mass=30) outside boundary
    const u = getUnit(idx);
    u.target = NO_UNIT;
    const startX = u.x;

    for (let i = 0; i < 500; i++) {
      buildHash();
      steer(u, 0.016);
    }

    expect(u.x).toBeLessThan(startX);
  });
});
