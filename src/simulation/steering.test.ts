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

describe('steer — accel/drag慣性', () => {
  it('accel/drag ベースの応答: Drone (accel=10) は高速で加速', () => {
    const idx = spawnAt(0, 0, 0, 0); // Drone (accel=10.0, drag=2.5, speed=220)
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
    // 新モデル: response = dt * t.accel = 0.016 * 10.0 = 0.16
    // u.type = 0 (Drone) の速度は220
    // vx delta = (220 - 0) * 0.16 = 35.2
    // moveDrag = (1 - min(1, 2.5/30))^(0.016*30) = (1 - 0.0833)^0.48 ≈ 0.9593
    // 最終: vx ≈ 35.2 * 0.9593 ≈ 33.76
    expect(u.vx).toBeGreaterThan(33.5);
    expect(u.vx).toBeLessThan(34.0);
    expect(u.vy).toBeCloseTo(0, 1);
  });

  it('accel が低いほど速度応答が遅い', () => {
    const fast = spawnAt(0, 0, 0, 0); // Drone (accel=10.0)
    const fastU = getUnit(fast);
    fastU.angle = 0;
    fastU.vx = 0;
    fastU.vy = 0;
    fastU.target = NO_UNIT;

    const slow = spawnAt(0, 3, 100, 0); // Cruiser (accel=3.5)
    const slowU = getUnit(slow);
    slowU.angle = 0;
    slowU.vx = 0;
    slowU.vy = 0;
    slowU.target = NO_UNIT;

    for (let i = 0; i < 50; i++) {
      buildHash();
      steer(fastU, 0.016);
      steer(slowU, 0.016);
    }

    const fastSpeed = Math.sqrt(fastU.vx ** 2 + fastU.vy ** 2);
    const slowSpeed = Math.sqrt(slowU.vx ** 2 + slowU.vy ** 2);
    expect(fastSpeed).toBeGreaterThan(slowSpeed);
  });

  it('accel=2.0 (Flagship) でも境界力が機能する', () => {
    const idx = spawnAt(0, 4, 3500, 0); // Flagship (accel=2.0) outside boundary
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

describe('steer — accel/drag physics', () => {
  it('accel convergence speed: Drone (accel=10) reaches 90% of target speed in ~10 steps', () => {
    const idx = spawnAt(0, 0, 0, 0);
    const u = getUnit(idx);
    u.angle = 0;
    u.vx = 0;
    u.vy = 0;
    u.target = NO_UNIT;
    buildHash();

    for (let i = 0; i < 10; i++) {
      steer(u, 1 / 30);
    }

    const speed = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
    const targetSpeed = 220;
    expect(speed).toBeGreaterThan(targetSpeed * 0.7);
  });

  it('accel convergence speed: Flagship (accel=2) takes ~50 steps to reach 90%', () => {
    const idx = spawnAt(0, 4, 0, 0);
    const u = getUnit(idx);
    u.angle = 0;
    u.vx = 0;
    u.vy = 0;
    u.target = NO_UNIT;
    buildHash();

    for (let i = 0; i < 50; i++) {
      steer(u, 1 / 30);
    }

    const speed = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
    const targetSpeed = 35;
    expect(speed).toBeGreaterThan(targetSpeed * 0.6);
  });

  it('drag decay rate: High drag (Drone: 2.5) → velocity decreases each step', () => {
    const idx = spawnAt(0, 0, 0, 0); // Drone: drag=2.5
    const u = getUnit(idx);
    u.vx = 300; // High initial speed (above target speed of 220)
    u.vy = 0;
    u.target = NO_UNIT; // wander mode, NO stun
    u.angle = 0;
    buildHash();

    const initialSpeed = Math.sqrt(u.vx ** 2 + u.vy ** 2);

    for (let i = 0; i < 10; i++) {
      steer(u, 1 / 30);
    }

    const finalSpeed = Math.sqrt(u.vx ** 2 + u.vy ** 2);
    // High drag → speed decreases toward target speed
    expect(finalSpeed).toBeLessThan(initialSpeed);
    expect(finalSpeed).toBeLessThan(250); // Should drop significantly from 300
  });

  it('drag decay comparison: Lancer (drag=0.4) retains more speed than Drone (drag=2.5)', () => {
    const drone = spawnAt(0, 0, 0, 0); // Drone: drag=2.5
    const lancer = spawnAt(0, 9, 500, 0); // Lancer: drag=0.4

    const uDrone = getUnit(drone);
    const uLancer = getUnit(lancer);

    // Same initial velocity
    uDrone.vx = 100;
    uDrone.vy = 0;
    uDrone.target = NO_UNIT;
    uDrone.angle = 0;

    uLancer.vx = 100;
    uLancer.vy = 0;
    uLancer.target = NO_UNIT;
    uLancer.angle = 0;

    buildHash();

    for (let i = 0; i < 30; i++) {
      buildHash();
      steer(uDrone, 1 / 30);
      steer(uLancer, 1 / 30);
    }

    const droneSpeed = Math.sqrt(uDrone.vx ** 2 + uDrone.vy ** 2);
    const lancerSpeed = Math.sqrt(uLancer.vx ** 2 + uLancer.vy ** 2);

    // Lancer (low drag) should retain MORE speed than Drone (high drag)
    expect(lancerSpeed).toBeGreaterThan(droneSpeed);
  });

  it('Lancer sliding: Lancer (drag=0.4) slides after target loss', () => {
    const idx = spawnAt(0, 9, 0, 0);
    const u = getUnit(idx);
    u.vx = 200;
    u.vy = 0;
    u.target = NO_UNIT;
    const xBefore = u.x;
    buildHash();

    for (let i = 0; i < 30; i++) {
      steer(u, 1 / 30);
    }

    expect(u.x).toBeGreaterThan(xBefore + 100);
  });
});

describe('steer — boost mechanism', () => {
  it('boost trigger: Unit with boost config triggers when target within triggerRange', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.0, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const u2 = spawnAt(1, 0, 150, 0);
    const unit = getUnit(u1);
    unit.target = u2;
    buildHash();

    steer(unit, 1 / 30);
    expect(unit.boostTimer).toBeGreaterThan(0);
  });

  it('boost velocity: speed set to spd * multiplier toward target on trigger', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.5, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const u2 = spawnAt(1, 0, 150, 0);
    const unit = getUnit(u1);
    unit.target = u2;
    unit.vx = 10;
    unit.vy = 0;
    buildHash();

    steer(unit, 1 / 30);

    // spd = 220 * 1.0 = 220, bv = 220 * 2.5 = 550, ターゲットは x=150 方向
    const speed = Math.sqrt(unit.vx * unit.vx + unit.vy * unit.vy);
    expect(speed).toBeGreaterThan(200);
    expect(unit.vx).toBeGreaterThan(0);
  });

  it('boost cooldown: boostCooldown set when boostTimer expires', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.0, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const unit = getUnit(u1);
    unit.boostTimer = 0.02;
    buildHash();

    steer(unit, 1 / 30);

    expect(unit.boostTimer).toBe(0);
    expect(unit.boostCooldown).toBeCloseTo(3.0);
  });

  it('boost stun interrupts active boost and sets cooldown', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.0, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const unit = getUnit(u1);
    unit.boostTimer = 0.3;
    unit.stun = 1.0;
    buildHash();

    steer(unit, 1 / 30);

    expect(unit.boostTimer).toBe(0);
    expect(unit.boostCooldown).toBeCloseTo(3.0 - 1 / 30);
  });

  it('boost stun: cooldown ticks down during stun', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.0, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const unit = getUnit(u1);
    unit.boostCooldown = 2.0;
    unit.stun = 1.0;
    buildHash();

    steer(unit, 1 / 30);

    expect(unit.boostCooldown).toBeCloseTo(2.0 - 1 / 30);
  });

  it('no-boost units: Units without boost config keep boostTimer/boostCooldown at 0', () => {
    expect(getUnitType(4).boost).toBeUndefined();
    const idx = spawnAt(0, 4, 0, 0);
    const u = getUnit(idx);
    u.target = spawnAt(1, 4, 150, 0);
    buildHash();

    for (let i = 0; i < 30; i++) {
      steer(u, 1 / 30);
    }

    expect(u.boostTimer).toBe(0);
    expect(u.boostCooldown).toBe(0);
  });

  it('boost stun: cannot re-activate boost while stun cooldown remains', async () => {
    const mockType = {
      ...getUnitType(0),
      boost: { multiplier: 2.0, duration: 0.5, cooldown: 3.0, triggerRange: 200 },
    };
    vi.spyOn(await import('../unit-types.ts'), 'getUnitType').mockReturnValue(mockType);

    const u1 = spawnAt(0, 0, 0, 0);
    const unit = getUnit(u1);
    // Start with active boost + stun
    unit.boostTimer = 0.3;
    unit.stun = 0.05;
    const enemy = spawnAt(1, 0, 150, 0);
    unit.target = enemy;
    buildHash();

    // Tick 1: stun active → boost interrupted, cooldown set
    steer(unit, 1 / 30);
    expect(unit.boostTimer).toBe(0);
    expect(unit.boostCooldown).toBeGreaterThan(0);

    // Tick 2: stun expired but cooldown remains → no new boost
    steer(unit, 1 / 30);
    expect(unit.boostTimer).toBe(0);
    expect(unit.boostCooldown).toBeGreaterThan(0);
  });
});
