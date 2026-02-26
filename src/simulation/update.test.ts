import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGameLoopState, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams, getTrackingBeam, trackingBeams } from '../beams.ts';
import {
  AMP_BOOST_LINGER,
  POOL_UNITS,
  REF_FPS,
  REFLECT_FIELD_MAX_HP,
  SCRAMBLE_LINGER,
  SH_CIRCLE,
} from '../constants.ts';
import { decUnits, particle, poolCounts, projectile, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { unitTypeIndex } from '../unit-types.ts';
import { BASTION_ABSORB_RATIO, BASTION_SELF_ABSORB_RATIO, ORPHAN_TETHER_PROJECTILE_MULT } from './combat.ts';
import { addBeam, onKillUnit, spawnParticle, spawnProjectile } from './spawn.ts';
import { MAX_STEPS_PER_FRAME, REFLECT_FIELD_GRANT_INTERVAL, SHIELD_LINGER, TETHER_BEAM_LIFE } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  startGame: vi.fn(),
  initUI: vi.fn(),
}));

vi.mock('./spatial-hash.ts', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./spatial-hash.ts');
  return { ...actual, buildHash: vi.fn(actual.buildHash) };
});

import { addShake } from '../input/camera.ts';
import { buildHash } from './spatial-hash.ts';
import { update } from './update.ts';

const mockUpdateCodexDemo = vi.fn((_dt: number) => undefined);

function gameLoopState() {
  return makeGameLoopState(mockUpdateCodexDemo);
}

afterEach(() => {
  resetPools();
  resetState();
  mockUpdateCodexDemo.mockReset();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ============================================================
// 0. buildHash call count (sub-stepping verification)
// ============================================================
describe('buildHash call count — sub-stepping検証', () => {
  it('rawDt <= 1/REF_FPS: buildHash は1回だけ呼ばれる', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.02, 0, rng, gameLoopState());
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(1);
  });

  it('rawDt > 1/REF_FPS: 適切な回数サブステップが実行される (rawDt=0.066 → 2ステップ)', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.066, 0, rng, gameLoopState());
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(2);
  });

  it('rawDt > 1/REF_FPS: 3ステップ以上の分割 (rawDt=0.12 → 4ステップ)', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.12, 0, rng, gameLoopState());
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(4);
  });

  it('MAX_STEPS_PER_FRAME を超える rawDt: ステップ数がキャップされる', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    const maxStep = 1 / REF_FPS;
    const excessiveDt = maxStep * 15; // 15ステップ分の dt
    update(excessiveDt, 0, rng, gameLoopState());
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(MAX_STEPS_PER_FRAME);
  });
});

// ============================================================
// 1. dt sub-stepping
// ============================================================
describe('dt sub-stepping', () => {
  it('rawDt > 0.033 はサブステップに分割される', () => {
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, SH_CIRCLE);
    expect(poolCounts.particles).toBe(1);
    update(0.05, 0, rng, gameLoopState());
    // rawDt=0.05, maxStep=0.033, steps=ceil(0.05/0.033)=2, dt=0.05/2=0.025
    // life = 1.0 - 0.025*2 = 0.95
    expect(particle(0).life).toBeCloseTo(1.0 - 0.05);
  });

  it('rawDt <= 0.033 はそのまま使われる', () => {
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, SH_CIRCLE);
    update(0.02, 0, rng, gameLoopState());
    expect(particle(0).life).toBeCloseTo(1.0 - 0.02);
  });
});

// ============================================================
// 2. Particle + Beam (Step 5-6) — シンプルなので先にテスト
// ============================================================
describe('パーティクル pass', () => {
  it('移動 + drag 0.97', () => {
    spawnParticle(0, 0, 100, 200, 1.0, 1, 1, 1, 1, SH_CIRCLE);
    update(0.016, 0, rng, gameLoopState());
    expect(particle(0).x).toBeCloseTo(100 * 0.016, 1);
    expect(particle(0).vx).toBeCloseTo(100 * 0.97 ** (0.016 * 30));
    expect(particle(0).vy).toBeCloseTo(200 * 0.97 ** (0.016 * 30));
  });

  it('life<=0 で消滅', () => {
    spawnParticle(0, 0, 0, 0, 0.01, 1, 1, 1, 1, SH_CIRCLE);
    expect(poolCounts.particles).toBe(1);
    update(0.016, 0, rng, gameLoopState());
    expect(particle(0).alive).toBe(false);
    expect(poolCounts.particles).toBe(0);
  });
});

describe('ビーム pass', () => {
  it('life<=0 で beams から除去', () => {
    addBeam(0, 0, 100, 0, 1, 1, 1, 0.01, 2);
    expect(beams).toHaveLength(1);
    update(0.016, 0, rng, gameLoopState());
    expect(beams).toHaveLength(0);
  });
});

// ============================================================
// 3. steer + combat + trail (Step 2)
// ============================================================
describe('steer + combat + trail', () => {
  it('shieldLingerTimer が毎フレーム減衰する', () => {
    const idx = spawnAt(0, 0, 0, 0); // Drone
    unit(idx).shieldLingerTimer = 1.0;
    unit(idx).trailTimer = 99; // trail 抑制
    update(0.016, 0, rng, gameLoopState());
    expect(unit(idx).shieldLingerTimer).toBeCloseTo(1.0 - 0.016);
  });

  it('steer→combat 順序: tgt 設定と即発射', () => {
    const a = spawnAt(0, 1, 0, 0);
    const b = spawnAt(1, 1, 100, 0);
    unit(a).trailTimer = 99;
    unit(b).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).target).toBeGreaterThanOrEqual(0);
    expect(poolCounts.projectiles).toBeGreaterThanOrEqual(1);
  });

  it('trail timer: trailTimer<=0 でパーティクル生成', () => {
    const idx = spawnAt(0, 0, 500, 500);
    unit(idx).trailTimer = 0.001;
    update(0.016, 0, rng, gameLoopState());
    expect(poolCounts.particles).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. Reflector reflect field (Step 3)
// ============================================================
describe('Reflector reflect field', () => {
  it('範囲内の味方が reflectFieldHp=MAX になる（エネルギーあり）', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('範囲外の味方は reflectFieldHp=0', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 250, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(0);
  });

  it('敵チームは reflectFieldHp=0', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 0, 50, 0);
    unit(ref).trailTimer = 99;
    unit(enemy).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).reflectFieldHp).toBe(0);
  });

  it('codexOpen=true → Reflector は通常通りフィールドを付与する', () => {
    state.codexOpen = true;
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('maxEnergy=0のReflectorは味方にフィールドを付与しない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).energy = 0;
    unit(ref).maxEnergy = 0;
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(0);
  });

  it('シールドダウン中のReflectorでも味方フィールド補充は継続', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).energy = 0;
    unit(ref).shieldCooldown = 3; // ダウン中
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('Reflector範囲から出てもフィールドは持続する', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    unit(ally).x = 500;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });
});

// ============================================================
// 4b. Bastion tether (Step 3b)
// ============================================================
describe('Bastion tether', () => {
  it('範囲内の味方に shieldLingerTimer を付与しテザービームを生成する', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBe(SHIELD_LINGER);
    expect(trackingBeams.length).toBeGreaterThan(0);
  });

  it('範囲外の味方にはテザーが付与されない', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 500, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBe(0);
    expect(trackingBeams.length).toBe(0);
  });

  it('テザービームがユニットの移動に追従する', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBeGreaterThan(0);
    update(0.016, 0, rng, gameLoopState());
    const tb = trackingBeams[0];
    expect(tb).toBeDefined();
    if (tb === undefined) return;
    expect(tb.x1).toBe(unit(bastion).x);
    expect(tb.y1).toBe(unit(bastion).y);
    expect(tb.x2).toBe(unit(ally).x);
    expect(tb.y2).toBe(unit(ally).y);
  });

  it('テザー接続中はビームが消えない（60フレーム後も life > 0）', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBe(1);
    // 60フレーム分（TETHER_BEAM_LIFE=0.7秒を大幅に超える）
    for (let f = 0; f < 60; f++) {
      update(0.016, 0, rng, gameLoopState());
    }
    expect(trackingBeams.length).toBe(1);
    expect(getTrackingBeam(0).life).toBeGreaterThan(0);
  });

  it('範囲外に出るとビームがフェードアウトして消える', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBe(1);
    // 範囲外に移動
    unit(ally).x = 5000;
    unit(ally).y = 5000;
    // TETHER_BEAM_LIFE (0.7s) 以上の時間を進める
    const frames = Math.ceil(TETHER_BEAM_LIFE / 0.016) + 5;
    for (let f = 0; f < frames; f++) {
      update(0.016, 0, rng, gameLoopState());
    }
    expect(trackingBeams.length).toBe(0);
  });

  it('接続中もビーム重複が発生しない（30フレーム後もtrackingBeams.length === 1）', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(bastion).trailTimer = 99;
    unit(ally).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBe(1);
    for (let f = 0; f < 30; f++) {
      update(0.016, 0, rng, gameLoopState());
    }
    expect(trackingBeams.length).toBe(1);
  });
});

// ============================================================
// 4c. Bastion self-shield (energy absorb)
// ============================================================
describe('Bastion self-shield', () => {
  it('energy>0 のBastionは被弾ダメージの30%をenergyで吸収する', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    unit(bastion).trailTimer = 99;
    unit(bastion).energy = 25;
    unit(bastion).maxEnergy = 25;
    const hpBefore = unit(bastion).hp;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 1, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    // 30% of 10 = 3 absorbed by energy, 70% = 7 to hp
    expect(unit(bastion).energy).toBeCloseTo(25 - 3);
    expect(unit(bastion).hp).toBeCloseTo(hpBefore - 7);
  });

  it('energy不足時は残energy分のみ吸収する', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    unit(bastion).trailTimer = 99;
    // maxEnergy=1 にキャップ → regenEnergy で 1 を超えない
    unit(bastion).energy = 1;
    unit(bastion).maxEnergy = 1;
    const hpBefore = unit(bastion).hp;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 1, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    // min(10*0.3, 1) = 1 absorbed, 9 to hp
    expect(unit(bastion).energy).toBeCloseTo(0);
    expect(unit(bastion).hp).toBeCloseTo(hpBefore - 9);
  });

  it('energy=0 のBastionは吸収しない', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    unit(bastion).trailTimer = 99;
    // maxEnergy=0 → regenEnergy がスキップされる
    unit(bastion).energy = 0;
    unit(bastion).maxEnergy = 0;
    const hpBefore = unit(bastion).hp;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 1, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(bastion).energy).toBe(0);
    expect(unit(bastion).hp).toBeCloseTo(hpBefore - 10);
  });

  it('テザー吸収と自身シールドがスタックする', () => {
    const bastion = spawnAt(1, 15, 0, 200);
    const target = spawnAt(1, 15, 0, 0);
    unit(bastion).trailTimer = 99;
    unit(target).trailTimer = 99;
    unit(target).energy = 25;
    unit(target).maxEnergy = 25;
    unit(target).shieldLingerTimer = 2;
    unit(target).shieldSourceUnit = bastion;
    const bastionHpBefore = unit(bastion).hp;
    const targetHpBefore = unit(target).hp;
    const dmg = 10;
    spawnProjectile(5, 0, 0, 0, 1.0, dmg, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    // 1) Tether absorbs 40%: bastion takes 4 directly to hp, remaining dmg = 6
    const tetherDmg = dmg * BASTION_ABSORB_RATIO;
    const afterTether = dmg - tetherDmg;
    // 2) Self-shield absorbs 30% of 6 = 1.8 from energy, hp takes 4.2
    const selfAbsorbed = afterTether * BASTION_SELF_ABSORB_RATIO;
    expect(unit(bastion).hp).toBeCloseTo(bastionHpBefore - tetherDmg);
    expect(unit(target).energy).toBeCloseTo(25 - selfAbsorbed);
    expect(unit(target).hp).toBeCloseTo(targetHpBefore - (afterTether - selfAbsorbed));
  });
});

// ============================================================
// 5. Projectile pass (Step 4)
// ============================================================
describe('projectile pass', () => {
  it('移動: x += vx*dt', () => {
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).x).toBeCloseTo(4.8);
  });

  it('life<=0 で消滅 (aoe=0)', () => {
    spawnProjectile(0, 0, 0, 0, 0.01, 5, 0, 2, 1, 0, 0);
    expect(poolCounts.projectiles).toBe(1);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).alive).toBe(false);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('AOE 爆発: 範囲内の敵にダメージ + addShake(3)', () => {
    const enemy = spawnAt(1, 1, 30, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 0.01, 8, 0, 2, 1, 0, 0, false, 70);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBeLessThan(10);
    expect(addShake).toHaveBeenCalledWith(3, expect.any(Number), expect.any(Number));
  });

  it('ユニットヒット: 通常ダメージ', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBe(5);
    expect(projectile(0).alive).toBe(false);
  });

  it('Bastion テザー下のヒット: Bastion が40%、味方が60%ダメージ', () => {
    const bastion = spawnAt(1, 15, 0, 200);
    const target = spawnAt(1, 1, 0, 0);
    unit(bastion).trailTimer = 99;
    unit(target).trailTimer = 99;
    unit(target).shieldLingerTimer = 2;
    unit(target).shieldSourceUnit = bastion;
    const bastionHpBefore = unit(bastion).hp;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    // target takes 60% of 10 = 6, so hp = 10 - 6 = 4
    expect(unit(target).hp).toBe(4);
    // bastion takes 40% of 10 = 4
    expect(unit(bastion).hp).toBe(bastionHpBefore - 4);
  });

  it('Bastion死亡済み参照: 孤児テザー軽減が適用される', () => {
    const bastion = spawnAt(1, 15, 0, 200);
    const target = spawnAt(1, 1, 0, 0);
    unit(bastion).trailTimer = 99;
    unit(target).trailTimer = 99;
    unit(target).shieldLingerTimer = 2;
    unit(target).shieldSourceUnit = bastion;
    // Bastion を死亡状態にする
    unit(bastion).alive = false;
    decUnits();
    const hpBefore = unit(target).hp;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(target).hp).toBe(hpBefore - 10 * ORPHAN_TETHER_PROJECTILE_MULT);
    expect(unit(target).shieldSourceUnit).toBe(NO_UNIT);
  });

  it('Bastion テザー吸収時にエネルギーフローパーティクルが生成される', () => {
    const bastion = spawnAt(1, 15, 0, 200);
    const target = spawnAt(1, 1, 0, 0);
    unit(bastion).trailTimer = 99;
    unit(target).trailTimer = 99;
    unit(target).shieldLingerTimer = 2;
    unit(target).shieldSourceUnit = bastion;
    const particlesBefore = poolCounts.particles;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    // テザー吸収が発生し、4個のエネルギーフローパーティクルが生成される
    expect(poolCounts.particles).toBeGreaterThanOrEqual(particlesBefore + 4);
  });

  it('ヒットで HP<=0 → ユニット死亡', () => {
    const enemy = spawnAt(1, 0, 3, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
    expect(poolCounts.units).toBe(0);
  });

  it('homing: ターゲット生存時に追尾で曲がる', () => {
    const target = spawnAt(1, 1, 0, 200);
    unit(target).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).vy).toBeGreaterThan(0);
  });

  it('homing: ターゲット死亡時は直進', () => {
    const target = spawnAt(1, 1, 0, 200);
    unit(target).alive = false;
    decUnits();
    unit(target).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).vy).toBe(0);
  });

  it('AOE 爆発: パーティクルがチームカラーを使う (hardcoded orange ではなく)', () => {
    // Team 0: blue (r=0, g=0.3, b=1)
    spawnProjectile(0, 0, 0, 0, 0.01, 8, 0, 2, 0, 0.3, 1, false, 70);
    expect(poolCounts.projectiles).toBe(1);
    const origParticleCount = poolCounts.particles;
    update(0.016, 0, rng, gameLoopState());
    // パーティクルが生成される (16個)
    expect(poolCounts.particles).toBeGreaterThan(origParticleCount);
    // 第1パーティクル（loop の最初）をチェック
    const p = particle(origParticleCount);
    // 期待値: p.r=0, p.g=0.3*0.8+0.2=0.44, p.b=1*0.3=0.3
    expect(p.r).toBeCloseTo(0, 5);
    expect(p.g).toBeCloseTo(0.3 * 0.8 + 0.2, 5);
    expect(p.b).toBeCloseTo(1 * 0.3, 5);
  });
});

// ============================================================
// 5b. Railgun hitscan
// ============================================================
const SNIPER_TYPE = unitTypeIndex('Sniper');

describe('railgun hitscan', () => {
  it('射線上の敵にダメージが入る', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    unit(sniper).angle = 0; // 右方向
    // 射程600以内・正面に配置
    const enemy = spawnAt(1, 0, 200, 0);
    unit(enemy).trailTimer = 99;
    const hpBefore = unit(enemy).hp;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBeLessThan(hpBefore);
  });

  it('複数の敵を貫通しダメージ 0.6 倍に減衰', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    unit(sniper).angle = 0;
    // 射線上に2体の敵を配置
    const enemy1 = spawnAt(1, 0, 150, 0);
    unit(enemy1).trailTimer = 99;
    unit(enemy1).hp = 200; // 死なないように
    unit(enemy1).maxHp = 200;
    const enemy2 = spawnAt(1, 0, 300, 0);
    unit(enemy2).trailTimer = 99;
    unit(enemy2).hp = 200;
    unit(enemy2).maxHp = 200;
    update(0.016, 0, rng, gameLoopState());
    const dmg1 = 200 - unit(enemy1).hp;
    const dmg2 = 200 - unit(enemy2).hp;
    expect(dmg1).toBeGreaterThan(0);
    expect(dmg2).toBeGreaterThan(0);
    expect(dmg2).toBeCloseTo(dmg1 * 0.6, 0);
  });

  it('reflectFieldHp でブロック', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    unit(sniper).angle = 0;
    const enemy = spawnAt(1, 0, 200, 0);
    unit(enemy).trailTimer = 99;
    unit(enemy).reflectFieldHp = 100;
    const hpBefore = unit(enemy).hp;
    update(0.016, 0, rng, gameLoopState());
    // フィールドが減衰しHP変化なし
    expect(unit(enemy).reflectFieldHp).toBeLessThan(100);
    expect(unit(enemy).hp).toBe(hpBefore);
  });

  it('キル時に cooldownResetOnKill が適用される', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    unit(sniper).angle = 0;
    // HP低い敵を配置（確実にキル）
    const enemy = spawnAt(1, 0, 200, 0);
    unit(enemy).trailTimer = 99;
    unit(enemy).hp = 1;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
    // cooldownResetOnKill=0.8
    expect(unit(sniper).cooldown).toBeCloseTo(0.8, 1);
  });

  it('移動中の敵にもヒットスキャンが命中する', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    // 敵は (200,0) で vy=200 の高速移動中
    const enemy = spawnAt(1, 0, 200, 0);
    unit(enemy).trailTimer = 99;
    unit(enemy).vy = 200;
    unit(enemy).hp = 200;
    unit(enemy).maxHp = 200;
    const hpBefore = unit(enemy).hp;
    update(0.016, 0, rng, gameLoopState());
    // 直射角度 = atan2(0, 200) = 0 → 射線は敵の現在位置を通る → ヒット
    expect(unit(enemy).hp).toBeLessThan(hpBefore);
  });

  it('射線外の敵にはダメージが入らない', () => {
    const sniper = spawnAt(0, SNIPER_TYPE, 0, 0);
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 0;
    unit(sniper).angle = 0; // 右方向
    // 射程外（range=600を超える位置）に配置
    const enemy = spawnAt(1, 0, 800, 0);
    unit(enemy).trailTimer = 99;
    const hpBefore = unit(enemy).hp;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBe(hpBefore);
  });
});

describe('キル時クールダウン短縮', () => {
  it('sourceUnit 指定時: キルで kills カウントが上昇', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper
    unit(sniper).trailTimer = 99;
    const enemy = spawnAt(1, 0, 3, 0); // Drone hp=3
    unit(enemy).trailTimer = 99;
    // sourceUnit=sniper の弾を生成
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0, false, 0, undefined, sniper);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
    expect(unit(sniper).kills).toBe(1);
  });

  it('cooldownResetOnKill: キル時にクールダウンが短縮される', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (cooldownResetOnKill=0.8)
    unit(sniper).trailTimer = 99;
    unit(sniper).cooldown = 2.5; // 射撃直後のクールダウン
    const enemy = spawnAt(1, 0, 3, 0); // Drone hp=3
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0, false, 0, undefined, sniper);
    update(0.016, 0, rng, gameLoopState());
    // combat() で cooldown 2.5→2.484, 次に detectProjectileHit で min(2.484, 0.8)=0.8
    expect(unit(sniper).cooldown).toBeCloseTo(0.8, 1);
  });

  it('sourceUnit 未指定: キルしても誰のvetも上昇しない', () => {
    const enemy = spawnAt(1, 0, 3, 0);
    unit(enemy).trailTimer = 99;
    // sourceUnit なし（デフォルト NO_UNIT）→ 誰もvet上昇しない
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
  });
});

// ============================================================
// 6. reinforce
// ============================================================
describe('reinforce', () => {
  it('reinforce が呼び出され両チームにユニットが増える', () => {
    state.reinforcementTimer = 2.49;
    update(0.016, 0, rng, gameLoopState());
    let t0 = 0;
    let t1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unit(i).alive) {
        if (unit(i).team === 0) t0++;
        else t1++;
      }
    }
    expect(t0).toBeGreaterThan(0);
    expect(t1).toBeGreaterThan(0);
  });
});

// ============================================================
// 7. codexOpen 分岐
// ============================================================
describe('codexOpen 分岐', () => {
  it('codexOpen=true → reinforce スキップ + updateCodexDemo 呼出', () => {
    state.codexOpen = true;
    const idx = spawnAt(0, 1, 0, 0);
    unit(idx).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(mockUpdateCodexDemo).toHaveBeenCalled();
  });

  it('codexOpen=true → 全ユニットの steer/combat が走る（snapshot/restore方式）', () => {
    state.codexOpen = true;
    const idx = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(idx).trailTimer = 99;
    unit(idx).cooldown = 0;
    unit(enemy).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(idx).target).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 8. swarmN 更新
// ============================================================
describe('swarmN 更新', () => {
  it('同型味方3体が近傍 → swarmN=3', () => {
    const a = spawnAt(0, 0, 0, 0); // Drone (swarm:true)
    const b = spawnAt(0, 0, 20, 0);
    const c = spawnAt(0, 0, 0, 20);
    const d = spawnAt(0, 0, 20, 20);
    unit(a).trailTimer = 99;
    unit(b).trailTimer = 99;
    unit(c).trailTimer = 99;
    unit(d).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    // a の近傍に b,c,d → swarmN=3
    expect(unit(a).swarmN).toBe(3);
  });

  it('異なる type は swarmN にカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0); // Drone
    const b = spawnAt(0, 1, 20, 0); // Fighter (type !== 0)
    unit(a).trailTimer = 99;
    unit(b).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(0);
  });

  it('非 swarm ユニットは swarmN=0', () => {
    const a = spawnAt(0, 1, 0, 0); // Fighter (swarm:false)
    const b = spawnAt(0, 1, 20, 0);
    unit(a).trailTimer = 99;
    unit(b).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(0);
  });

  it('敵チームの同型は swarmN にカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0);
    spawnAt(1, 0, 20, 0);
    spawnAt(1, 0, 0, 20);
    unit(a).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(0);
  });

  it('7体以上でも swarmN は 6 にクランプされる', () => {
    const a = spawnAt(0, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const idx = spawnAt(0, 0, 10 + i * 5, 10);
      unit(idx).trailTimer = 99;
    }
    unit(a).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(6);
  });

  it('半径80外の味方はカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0);
    // CELL_SIZE=100, cr=ceil(80/100)=1 → 3x3セル走査。確実にセル外にするため距離201を使用
    const far = spawnAt(0, 0, 201, 0);
    unit(a).trailTimer = 99;
    unit(far).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(0);
  });

  it('codexOpen=true → swarmN は通常通り更新される（snapshot/restore方式）', () => {
    state.codexOpen = true;
    const a = spawnAt(0, 0, 0, 0);
    const b = spawnAt(0, 0, 20, 0);
    unit(a).trailTimer = 99;
    unit(b).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(a).swarmN).toBe(1);
  });
});

// ============================================================
// 9. Reflector shieldCooldown recovery
// ============================================================
describe('Reflector shieldCooldown 回復', () => {
  it('shieldCooldownがdt分カウントダウンされる', () => {
    const ref = spawnAt(0, 6, 0, 0);
    unit(ref).energy = 0;
    unit(ref).shieldCooldown = 3;
    unit(ref).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ref).shieldCooldown).toBeCloseTo(3 - 0.016);
  });

  it('shieldCooldown到達で全回復（energy = maxEnergy）', () => {
    const ref = spawnAt(0, 6, 0, 0);
    unit(ref).energy = 0;
    unit(ref).shieldCooldown = 0.01; // すぐ回復
    unit(ref).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ref).shieldCooldown).toBe(0);
    expect(unit(ref).energy).toBe(unit(ref).maxEnergy);
  });

  it('Bastionのenergy回復に影響なし', () => {
    const bastion = spawnAt(0, 15, 0, 0);
    unit(bastion).energy = 10;
    unit(bastion).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    // Bastion energyRegen=4, energy = 10 + 4*0.016 = 10.064
    expect(unit(bastion).energy).toBeCloseTo(10 + 4 * 0.016);
  });

  it('Reflectorはenergy自然回復しない（shieldCooldown=0、energy < maxEnergy）', () => {
    const ref = spawnAt(0, 6, 0, 0);
    unit(ref).energy = 50;
    unit(ref).shieldCooldown = 0;
    unit(ref).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    // shieldCooldown=0かつenergy>0: 何も起きない（energyRegenなし）
    expect(unit(ref).energy).toBe(50);
  });
});

// ============================================================
// 10. reflectFieldHp による確定反射
// ============================================================
describe('reflectFieldHp 反射', () => {
  it('reflectFieldHp > 0 で確定反射し、damage分減算される', () => {
    const ally = spawnAt(0, 1, 0, 0);
    unit(ally).reflectFieldHp = 10;
    unit(ally).trailTimer = 99;
    const hpBefore = unit(ally).hp;
    spawnProjectile(5, 0, -100, 0, 1.0, 3, 1, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(7); // 10 - 3
    expect(unit(ally).hp).toBe(hpBefore); // ダメージ受けない
    expect(projectile(0).team).toBe(0); // 反射済み
  });

  it('reflectFieldHp = 0 で反射なし', () => {
    const ally = spawnAt(0, 1, 0, 0);
    unit(ally).reflectFieldHp = 0;
    unit(ally).trailTimer = 99;
    const hpBefore = unit(ally).hp;
    spawnProjectile(5, 0, -100, 0, 1.0, 3, 1, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).hp).toBeLessThan(hpBefore); // ダメージ受ける
  });

  it('フィールドアクティブ中はHP再付与しない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    // 初回付与
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
    // HPを減らし、インターバルをリセットして「スキャンしてもHP>0なら上書きしない」ことを検証
    unit(ally).reflectFieldHp = 5;
    unit(ref).fieldGrantCooldown = 0;
    update(0.016, 0, rng, gameLoopState());
    // HP > 0 のため再付与されない
    expect(unit(ally).reflectFieldHp).toBe(5);
  });

  it('HP枯渇時に味方側ペナルティなし（次のスキャンで即再付与可能）', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    // 初回付与
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
    // フィールドHPを枯渇させる
    unit(ally).reflectFieldHp = 0;
    // Reflectorのインターバルをリセットして再スキャン可能に
    unit(ref).fieldGrantCooldown = 0;
    update(0.016, 0, rng, gameLoopState());
    // 即再付与される
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('ReflectorのfieldGrantCooldown > 0の間はフィールド付与しない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    unit(ref).fieldGrantCooldown = 2.0;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(0);
  });

  it('フィールド付与時にReflectorのfieldGrantCooldownがREFLECT_FIELD_GRANT_INTERVALに設定される', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
    expect(unit(ref).fieldGrantCooldown).toBe(REFLECT_FIELD_GRANT_INTERVAL);
  });

  it('全味方がフィールド保有中はfieldGrantCooldownが開始されない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    // 味方に事前にフィールドを付与
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    update(0.016, 0, rng, gameLoopState());
    // 全味方がフィールド保有中なので granted=false → インターバル開始しない
    expect(unit(ref).fieldGrantCooldown).toBe(0);
  });

  it('複数Reflectorがインターバルをずらしてカバーできる', () => {
    const ref1 = spawnAt(0, 6, 0, 0);
    const ref2 = spawnAt(0, 6, 30, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref1).trailTimer = 99;
    unit(ref2).trailTimer = 99;
    unit(ally).trailTimer = 99;
    // 初回: ref1 or ref2 が付与
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
    // フィールドを破壊し、ref1のインターバルを残す
    unit(ally).reflectFieldHp = 0;
    unit(ref1).fieldGrantCooldown = 0.5; // ref1はまだインターバル中
    unit(ref2).fieldGrantCooldown = 0; // ref2はインターバル完了
    update(0.016, 0, rng, gameLoopState());
    // ref2が再付与できる
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('範囲外に出ても被弾しない限りフィールドは消滅しない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    // 初回付与
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
    // 範囲外に移動
    unit(ally).x = 5000;
    // 60フレーム分経過させてもフィールドは残る
    for (let f = 0; f < 60; f++) {
      update(0.016, 0, rng, gameLoopState());
    }
    expect(unit(ally).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });
});

// ============================================================
// Amplifier tether
// ============================================================
const AMPLIFIER_TYPE = unitTypeIndex('Amplifier');
const FIGHTER_TYPE_IDX = unitTypeIndex('Fighter');

describe('Amplifier tether', () => {
  it('範囲内の味方に ampBoostTimer が付与されテザービームが生成される', () => {
    const amp = spawnAt(0, AMPLIFIER_TYPE, 0, 0);
    const ally = spawnAt(0, FIGHTER_TYPE_IDX, 50, 0);
    unit(amp).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).ampBoostTimer).toBe(AMP_BOOST_LINGER);
    expect(trackingBeams.length).toBeGreaterThanOrEqual(1);
    const tb = getTrackingBeam(trackingBeams.length - 1);
    // 橙系テザービーム色
    expect(tb.r).toBeCloseTo(1.0, 1);
    expect(tb.g).toBeCloseTo(0.6, 1);
    expect(tb.b).toBeCloseTo(0.15, 1);
  });

  it('範囲外の味方にはバフが付与されない', () => {
    const amp = spawnAt(0, AMPLIFIER_TYPE, 0, 0);
    unit(amp).trailTimer = 99;
    const farAlly = spawnAt(0, FIGHTER_TYPE_IDX, 500, 0);
    unit(farAlly).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(farAlly).ampBoostTimer).toBe(0);
  });

  it('Amplifier同士はバフしない', () => {
    const amp1 = spawnAt(0, AMPLIFIER_TYPE, 0, 0);
    const amp2 = spawnAt(0, AMPLIFIER_TYPE, 50, 0);
    unit(amp1).trailTimer = 99;
    unit(amp2).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(amp2).ampBoostTimer).toBe(0);
    expect(unit(amp1).ampBoostTimer).toBe(0);
  });

  it('ampBoostTimer が毎フレーム減衰する', () => {
    const ally = spawnAt(0, FIGHTER_TYPE_IDX, 0, 0);
    unit(ally).ampBoostTimer = 1.0;
    unit(ally).trailTimer = 99;
    update(0.5, 0, rng, gameLoopState());
    expect(unit(ally).ampBoostTimer).toBeCloseTo(0.5, 1);
  });
});

// ============================================================
// KillEvent 伝播テスト
// ============================================================
describe('KillEvent 伝播', () => {
  it('projectile kill: KillEvent に sourceUnit 情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const attacker = spawnAt(0, 1, 0, 200); // Fighter
    unit(attacker).trailTimer = 99;
    const enemy = spawnAt(1, 0, 3, 0); // Drone hp=3
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0, false, 0, undefined, attacker);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(1);
  });

  it('AOE kill: KillEvent に sourceUnit 情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const attacker = spawnAt(0, 2, 0, 200); // Bomber
    unit(attacker).trailTimer = 99;
    const enemy = spawnAt(1, 0, 30, 0); // Drone hp=3
    unit(enemy).trailTimer = 99;
    // 寿命切れで爆発する AOE 弾
    spawnProjectile(0, 0, 0, 0, 0.01, 100, 0, 2, 1, 0, 0, false, 70, undefined, attacker);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(2);
  });
});

// ============================================================
// Scrambler debuff
// ============================================================
const SCRAMBLER_TYPE = unitTypeIndex('Scrambler');

describe('Scrambler debuff', () => {
  it('範囲内の敵に scrambleTimer が付与される', () => {
    const scr = spawnAt(0, SCRAMBLER_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_IDX, 80, 0);
    unit(scr).trailTimer = 99;
    unit(enemy).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).scrambleTimer).toBe(SCRAMBLE_LINGER);
  });

  it('範囲外の敵にはデバフが付与されない', () => {
    const scr = spawnAt(0, SCRAMBLER_TYPE, 0, 0);
    unit(scr).trailTimer = 99;
    const farEnemy = spawnAt(1, FIGHTER_TYPE_IDX, 500, 0);
    unit(farEnemy).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(farEnemy).scrambleTimer).toBe(0);
  });

  it('味方にはデバフが付与されない', () => {
    const scr = spawnAt(0, SCRAMBLER_TYPE, 0, 0);
    const ally = spawnAt(0, FIGHTER_TYPE_IDX, 50, 0);
    unit(scr).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).scrambleTimer).toBe(0);
  });

  it('scrambleTimer が毎フレーム減衰する', () => {
    const enemy = spawnAt(1, FIGHTER_TYPE_IDX, 0, 0);
    unit(enemy).scrambleTimer = 1.0;
    unit(enemy).trailTimer = 99;
    update(0.5, 0, rng, gameLoopState());
    expect(unit(enemy).scrambleTimer).toBeCloseTo(0.5, 1);
  });
});
