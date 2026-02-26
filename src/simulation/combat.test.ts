import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_UNITS, REFLECT_FIELD_MAX_HP } from '../constants.ts';
import { decUnits, poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import type { ProjectileIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { AMP_DAMAGE_MULT, AMP_RANGE_MULT, ORPHAN_TETHER_BEAM_MULT, REFLECT_BEAM_DAMAGE_MULT } from './combat.ts';
import { buildHash } from './spatial-hash.ts';
import { killProjectile, onKillUnit, spawnProjectile } from './spawn.ts';
import { updateSwarmN } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import {
  _resetSweepHits,
  aimAt,
  BEAM_DECAY_RATE,
  BURST_INTERVAL,
  combat,
  demoFlag,
  HEALER_AMOUNT,
  HEALER_COOLDOWN,
  resetReflected,
  SWEEP_DURATION,
} from './combat.ts';

const unsubs: (() => void)[] = [];

afterEach(() => {
  for (const fn of unsubs) fn();
  unsubs.length = 0;
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('combat — 共通', () => {
  it('stun>0 → 即return（何も起きない）', () => {
    const idx = spawnAt(0, 1, 0, 0);
    const u = unit(idx);
    u.stun = 1.0;
    u.cooldown = 0;
    u.target = NO_UNIT;
    buildHash();
    combat(u, idx, 0.016, 0, rng);
    // cooldown はスタン中変化しない
    expect(u.cooldown).toBe(0);
  });

  it('cooldown, abilityCooldown がdt分減少する', () => {
    const idx = spawnAt(0, 1, 0, 0);
    const u = unit(idx);
    u.cooldown = 1.0;
    u.abilityCooldown = 0.5;
    u.target = NO_UNIT;
    buildHash();
    combat(u, idx, 0.016, 0, rng);
    expect(u.cooldown).toBeCloseTo(1.0 - 0.016);
    expect(u.abilityCooldown).toBeCloseTo(0.5 - 0.016);
  });
});

describe('combat — LANCER', () => {
  it('衝突時に敵にダメージ (mass×3×vd) + 自傷 (敵mass)', () => {
    const lancerType = unitType(9);
    const fighterType = unitType(1);
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 1, 5, 0);
    buildHash();
    const lancerHpBefore = unit(lancer).hp;
    const enemyHpBefore = unit(enemy).hp;
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // size合計 > distance=5 → 衝突, vet=0 → vd=1
    expect(unit(enemy).hp).toBe(enemyHpBefore - Math.ceil(lancerType.mass * 3 * 1));
    expect(unit(lancer).hp).toBe(lancerHpBefore - Math.ceil(fighterType.mass));
  });

  it('衝突でノックバック発生', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).vx = 0;
    unit(enemy).vy = 0;
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // ノックバックで敵のvxが変化
    expect(unit(enemy).vx).not.toBe(0);
  });

  it('敵HP<=0 → killUnit + explosion', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3, size=4)
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // Lancer damage = ceil(12*3*1) = 36 >> 3 → 敵は死亡
    expect(unit(enemy).alive).toBe(false);
  });

  it('自身HP<=0 → 自身も死亡', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    unit(lancer).hp = 1; // HP1にする
    spawnAt(1, 4, 5, 0); // Flagship (mass=30)
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // self damage = ceil(Flagship.mass) = ceil(30) = 30 >> 1
    expect(unit(lancer).alive).toBe(false);
  });
});

describe('combat — HEALER', () => {
  it('味方HP回復 (hp+HEALER_AMOUNT, 上限maxHp)', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(ally).hp).toBe(5 + HEALER_AMOUNT);
  });

  it('hp上限 (maxHp) を超えない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 9;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(ally).hp).toBe(10);
  });

  it('abilityCooldown=HEALER_COOLDOWN にリセットされる', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(healer).abilityCooldown).toBeCloseTo(HEALER_COOLDOWN);
  });

  it('自身は回復しない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    unit(healer).abilityCooldown = 0;
    unit(healer).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(healer).hp).toBe(5); // 変化なし
  });

  it('回復ビームが追加される', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('abilityCooldown>0 → 回復スキップ', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 1.0;
    unit(ally).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(ally).hp).toBe(5);
  });
});

describe('combat — REFLECTOR', () => {
  it('本体付近の敵弾を法線ベースで反射 + team変更', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    expect(p.team).toBe(1);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.team).toBe(0);
  });

  it('反射距離外の敵弾は反射しない', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(50, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    const vxBefore = p.vx;
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBe(vxBefore);
    expect(p.team).toBe(1);
  });

  it('自チーム弾は反射しない', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 0, 2, 1, 0, 0);
    const p = projectile(0);
    const vxBefore = p.vx;
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBe(vxBefore);
  });

  it('反射後に p.life が REFLECT_LIFE(0.5) にリセットされる', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 0.1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    expect(p.life).toBeCloseTo(0.1);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(p.life).toBeCloseTo(0.5);
  });

  it('反射後の弾速が元と同等（加速しない）', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    const speedBefore = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    const speedAfter = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    expect(speedAfter).toBeCloseTo(speedBefore, 1);
  });

  it('反射でシールドHP -= p.damage（固定コストではなく実ダメージ）', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    unit(reflector).energy = 50;
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 12, 1, 2, 1, 0, 0);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(unit(reflector).energy).toBe(38); // 50 - 12
  });

  it('シールドHP=0でshieldCooldownがセットされる', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    unit(reflector).energy = 5; // 弾のdamage(10)より低い
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 10, 1, 2, 1, 0, 0);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(unit(reflector).energy).toBe(0);
    expect(unit(reflector).shieldCooldown).toBe(unitType(6).shieldCooldown);
  });

  it('shieldCooldown中は反射スキップ', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    unit(reflector).energy = 50;
    unit(reflector).shieldCooldown = 3; // ダウン中
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    const vxBefore = p.vx;
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBe(vxBefore); // 反射されない
    expect(p.team).toBe(1);
    expect(unit(reflector).energy).toBe(50); // エネルギー消費なし
  });

  it('cooldown<=0 かつ target あり → 射撃', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    unit(reflector).cooldown = 0;
    unit(reflector).target = enemy;
    buildHash();
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).team).toBe(0);
    expect(unit(reflector).cooldown).toBeCloseTo(unitType(6).fireRate);
  });

  it('dead弾をスキップしてlive敵弾を正しく反射する', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    // slot 0, 1 にlive敵弾を作り、slot 0 をkillしてdead状態にする
    spawnProjectile(10, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    killProjectile(0 as ProjectileIndex);
    expect(projectile(0).alive).toBe(false);
    expect(projectile(1).alive).toBe(true);
    expect(projectile(1).team).toBe(1);
    combat(unit(reflector), reflector, 0.016, 0, rng);
    expect(projectile(1).team).toBe(0);
    expect(projectile(1).vx).toBeGreaterThan(0);
  });

  it('同一フレーム内で2体のReflectorが同じ弾を二重反射しない', () => {
    const r1 = spawnAt(0, 6, 0, 0);
    const r2 = spawnAt(0, 6, 25, 0);
    buildHash();
    spawnProjectile(12, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = projectile(0);
    combat(unit(r1), r1, 0.016, 0, rng);
    expect(p.team).toBe(0);
    const vxAfterFirst = p.vx;
    combat(unit(r2), r2, 0.016, 0, rng);
    expect(p.vx).toBe(vxAfterFirst);
    expect(p.team).toBe(0);
  });
});

describe('combat — CARRIER', () => {
  it('spawnCooldown<=0 で Drone×4 スポーン', () => {
    const carrier = spawnAt(0, 7, 0, 0); // Carrier
    unit(carrier).spawnCooldown = 0; // クールダウン切れ
    const ucBefore = poolCounts.units;
    buildHash();
    combat(unit(carrier), carrier, 0.016, 0, rng);
    // Drone×4 生成
    expect(poolCounts.units).toBe(ucBefore + 4);
    // Drone (type=0) が生成されている
    let drones = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unit(i).alive && unit(i).type === 0 && i !== carrier) drones++;
    }
    expect(drones).toBe(4);
  });

  it('spawnCooldown > 0 → スポーンなし', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    unit(carrier).spawnCooldown = 5.0;
    const ucBefore = poolCounts.units;
    buildHash();
    combat(unit(carrier), carrier, 0.016, 0, rng);
    expect(poolCounts.units).toBe(ucBefore);
  });

  it('spawnCooldown リセット', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    unit(carrier).spawnCooldown = 0;
    buildHash();
    combat(unit(carrier), carrier, 0.016, 0, rng);
    // spawnCooldown = 4 + random * 2 (PRNG sequence value)
    expect(unit(carrier).spawnCooldown).toBeGreaterThan(4);
    expect(unit(carrier).spawnCooldown).toBeLessThan(6);
  });
});

describe('combat — DISRUPTOR', () => {
  it('範囲内の敵にstun=1.5 + ダメージ', () => {
    const disruptorType = unitType(11);
    const disruptor = spawnAt(0, 11, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(disruptor).abilityCooldown = 0;
    unit(disruptor).target = enemy;
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(disruptor), disruptor, 0.016, 0, rng);
    expect(unit(enemy).stun).toBe(1.5);
    expect(unit(enemy).hp).toBe(hpBefore - disruptorType.damage);
  });

  it('tgt<0 → 即return', () => {
    const disruptor = spawnAt(0, 11, 0, 0);
    unit(disruptor).abilityCooldown = 0;
    unit(disruptor).target = NO_UNIT;
    buildHash();
    combat(unit(disruptor), disruptor, 0.016, 0, rng);
    expect(poolCounts.particles).toBe(0); // パーティクルなし = 何も実行されず
  });

  it('味方にスタンはかからない', () => {
    const disruptor = spawnAt(0, 11, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(disruptor).abilityCooldown = 0;
    unit(disruptor).target = enemy;
    buildHash();
    combat(unit(disruptor), disruptor, 0.016, 0, rng);
    expect(unit(ally).stun).toBe(0);
    expect(unit(enemy).stun).toBe(1.5);
  });
});

describe('combat — TELEPORTER (3連ブリンク)', () => {
  it('距離80-600で出発 → blinkPhase=1, blinkCount未減', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    expect(unit(tp).blinkCount).toBe(3);
    expect(unit(tp).teleportTimer).toBeCloseTo(0.25);
    expect(poolCounts.projectiles).toBe(0);
    expect(poolCounts.particles).toBe(8);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('到着: blinkPhase=0, blinkCount--, 2発射撃', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(0);
    expect(unit(tp).blinkCount).toBe(2);
    expect(poolCounts.projectiles).toBe(2);
    expect(poolCounts.particles).toBeGreaterThanOrEqual(19);
  });

  it('シーケンス継続: blinkCount>0 → 出発+到着ペア', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).blinkCount = 2;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    expect(unit(tp).blinkCount).toBe(2);
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(0);
    expect(unit(tp).blinkCount).toBe(1);
    expect(poolCounts.projectiles).toBe(2);
  });

  it('最終ブリンク: blinkCount=1→出発→到着→0、メインCDセット', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).blinkCount = 1;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkCount).toBe(0);
    expect(unit(tp).blinkPhase).toBe(0);
    expect(unit(tp).teleportTimer).toBeGreaterThanOrEqual(2.5);
    expect(unit(tp).teleportTimer).toBeLessThanOrEqual(4.0);
    expect(poolCounts.projectiles).toBe(2);
  });

  it('3連ブリンク全実行で計6発', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // ブリンク1: 出発→到着
    combat(unit(tp), tp, 0.016, 0, rng);
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    // ブリンク2: 出発→到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(4);
    // ブリンク3: 出発→到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(6);
    expect(unit(tp).blinkCount).toBe(0);
  });

  it('teleportTimer>0 では何もしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 3.0;
    unit(tp).target = enemy;
    unit(tp).cooldown = 999;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).teleportTimer).toBeCloseTo(3.0 - 0.016);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('距離が80未満ではブリンク開始しない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 30, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    unit(tp).cooldown = 999;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).teleportTimer).toBeCloseTo(-0.016);
    expect(poolCounts.projectiles).toBe(0);
    expect(unit(tp).blinkCount).toBe(0);
  });

  it('ターゲット死亡でblinkCountリセット', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).blinkCount = 2;
    unit(tp).target = enemy;
    unit(enemy).alive = false;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkCount).toBe(0);
    expect(unit(tp).target).toBe(NO_UNIT);
  });

  it('ターゲットなしでblinkCountリセット', () => {
    const tp = spawnAt(0, 13, 0, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).blinkCount = 2;
    unit(tp).target = NO_UNIT;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkCount).toBe(0);
  });

  it('到着後はcooldownが抑制されfireNormalが発火しない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).cooldown = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).cooldown).toBeGreaterThanOrEqual(0.14);
    expect(poolCounts.projectiles).toBe(2);
  });

  it('射撃にsourceUnitが設定される', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(projectile(0).sourceUnit).toBe(tp);
    expect(projectile(1).sourceUnit).toBe(tp);
  });

  it('blinkPhase=1の中間状態: 不可視で射撃なし', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    expect(poolCounts.projectiles).toBe(0);
    expect(unit(tp).teleportTimer).toBeCloseTo(0.25);
  });

  it('ワープ中にターゲット死亡 → 到着はするが射撃なし', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    // ワープ中にターゲット死亡
    unit(enemy).alive = false;
    // 到着
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(0);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('着地衝撃: 近接敵にノックバック + ミニスタン', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const nearby = spawnAt(1, 0, 0, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(tp).blinkPhase).toBe(1);
    // 到着地点の近くに敵を移動
    const tpU = unit(tp);
    unit(nearby).x = tpU.x + 30;
    unit(nearby).y = tpU.y;
    unit(nearby).vx = 0;
    unit(nearby).vy = 0;
    unit(nearby).stun = 0;
    // hashを再構築して到着
    buildHash();
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(nearby).stun).toBeGreaterThanOrEqual(0.25);
    expect(unit(nearby).vx).not.toBe(0);
  });

  it('着地衝撃: 味方にはノックバック/スタンがかからない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const ally = spawnAt(0, 0, 0, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    // 味方を到着地点の近くに移動
    const tpU = unit(tp);
    unit(ally).x = tpU.x + 20;
    unit(ally).y = tpU.y;
    unit(ally).stun = 0;
    unit(ally).vx = 0;
    unit(ally).vy = 0;
    buildHash();
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(ally).stun).toBe(0);
    expect(unit(ally).vx).toBe(0);
    expect(unit(ally).vy).toBe(0);
  });

  it('着地衝撃: 効果範囲外の敵は影響なし', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const farEnemy = spawnAt(1, 0, 0, 0);
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    buildHash();
    // 出発
    combat(unit(tp), tp, 0.016, 0, rng);
    // 遠い敵を着地点から半径80超の位置に配置
    const tpU = unit(tp);
    unit(farEnemy).x = tpU.x + 150;
    unit(farEnemy).y = tpU.y;
    unit(farEnemy).stun = 0;
    unit(farEnemy).vx = 0;
    unit(farEnemy).vy = 0;
    buildHash();
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(farEnemy).stun).toBe(0);
    expect(unit(farEnemy).vx).toBe(0);
    expect(unit(farEnemy).vy).toBe(0);
  });
});

describe('combat — CHAIN LIGHTNING', () => {
  it('chainLightning() 呼出 + cooldownリセット', () => {
    const arcer = spawnAt(0, 14, 0, 0); // Arcer (rng=250, fireRate=2)
    const enemy = spawnAt(1, 1, 100, 0);
    unit(arcer).cooldown = 0;
    unit(arcer).target = enemy;
    buildHash();
    combat(unit(arcer), arcer, 0.016, 0, rng);
    // cooldown = fireRate = 2
    expect(unit(arcer).cooldown).toBeCloseTo(unitType(14).fireRate);
    // ビーム + ダメージ
    expect(beams.length).toBeGreaterThan(0);
  });

  it('tgt<0 → 即return', () => {
    const arcer = spawnAt(0, 14, 0, 0);
    unit(arcer).cooldown = 0;
    unit(arcer).target = NO_UNIT;
    buildHash();
    combat(unit(arcer), arcer, 0.016, 0, rng);
    expect(beams.length).toBe(0);
  });
});

describe('combat — NORMAL FIRE', () => {
  it('射程内で cooldown<=0 → プロジェクタイル発射', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170, fireRate=0.9, burst=3)
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(unit(fighter).cooldown).toBeCloseTo(BURST_INTERVAL);
  });

  it('射程外 → プロジェクタイルなし', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170)
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > rng
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('vet=1: damage×1.2', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).vet = 1;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    const fighterType = unitType(1);
    expect(projectile(0).damage).toBeCloseTo(fighterType.damage * 1.2);
  });

  it('vet=2: damage×1.4', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).vet = 2;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    const fighterType = unitType(1);
    expect(projectile(0).damage).toBeCloseTo(fighterType.damage * 1.4);
  });

  it('homing: Launcher → 3発ホーミングミサイル (homing burst)', () => {
    const launcher = spawnAt(0, 10, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(launcher).cooldown = 0;
    unit(launcher).target = enemy;
    buildHash();

    combat(unit(launcher), launcher, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).homing).toBe(true);
    expect(projectile(0).target).toBe(enemy);
    expect(unit(launcher).burstCount).toBe(2);

    unit(launcher).cooldown = 0;
    combat(unit(launcher), launcher, 0.016, 0, rng);
    unit(launcher).cooldown = 0;
    combat(unit(launcher), launcher, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(3);
    expect(unit(launcher).burstCount).toBe(0);
    expect(projectile(1).homing).toBe(true);
    expect(projectile(2).homing).toBe(true);
    expect(unit(launcher).cooldown).toBeCloseTo(unitType(10).fireRate, 1);
  });

  it('aoe: AOEプロジェクタイル生成', () => {
    const bomberType = unitType(2);
    const bomber = spawnAt(0, 2, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(bomberType.aoe);
  });

  it('carpet: Bomber → 4発AOEプロジェクタイル (carpet bomb)', () => {
    const bomberType = unitType(2);
    const bomber = spawnAt(0, 2, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();

    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(bomberType.aoe);
    expect(unit(bomber).burstCount).toBe(3);

    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    expect(unit(bomber).burstCount).toBe(2);

    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(4);
    expect(unit(bomber).burstCount).toBe(0);
    expect(unit(bomber).cooldown).toBeCloseTo(bomberType.fireRate, 1);
  });

  it('broadside: Flagship → チャージ→メイン3発→側面2発', () => {
    const flagship = spawnAt(0, 4, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(flagship).cooldown = 0;
    unit(flagship).target = enemy;
    buildHash();

    // given: チャージ開始
    combat(unit(flagship), flagship, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(0);
    expect(unit(flagship).beamOn).toBeGreaterThan(0);

    // when: チャージ完了まで進める (chargeTime=0.3s)
    const chargeFrames = Math.ceil(0.3 / 0.016) + 1;
    for (let i = 0; i < chargeFrames; i++) {
      combat(unit(flagship), flagship, 0.016, 0, rng);
    }
    // then: メイン砲3発発射、broadside待ち
    expect(poolCounts.projectiles).toBe(3);
    expect(unit(flagship).broadsidePhase).toBe(-1);

    // when: broadside delay消化
    unit(flagship).cooldown = 0;
    combat(unit(flagship), flagship, 0.016, 0, rng);
    // then: メイン3 + 側面2 = 5発
    expect(poolCounts.projectiles).toBe(5);
    expect(unit(flagship).broadsidePhase).toBe(0);
  });

  it('sniper: Sniper (shape=8) → レールガン + tracerビーム', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (shape=8, rng=600)
    const enemy = spawnAt(1, 1, 300, 0);
    unit(sniper).cooldown = 0;
    unit(sniper).target = enemy;
    buildHash();
    combat(unit(sniper), sniper, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    // tracerビームが追加される
    expect(beams.length).toBeGreaterThan(0);
    // マズルフラッシュパーティクル
    expect(poolCounts.particles).toBeGreaterThan(0);
  });

  it('dead target → tgt=-1 に設定して return', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(enemy).alive = false; // 死亡状態
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).target).toBe(NO_UNIT);
    expect(poolCounts.projectiles).toBe(0);
  });
});

describe('combat — UNIT STATS', () => {
  it('Cruiser(type 3) に sweep: true がある', () => {
    expect(unitType(3).sweep).toBe(true);
  });

  it('Cruiser の fireRate は 1.5', () => {
    expect(unitType(3).fireRate).toBe(1.5);
  });

  it('Cruiser の damage は 8', () => {
    expect(unitType(3).damage).toBe(8);
  });

  it('Scorcher(type 12) の fireRate は 0.1', () => {
    expect(unitType(12).fireRate).toBe(0.1);
  });

  it('Scorcher の damage は 0.8', () => {
    expect(unitType(12).damage).toBe(0.8);
  });

  it('Scorcher に sweep がない', () => {
    expect(unitType(12).sweep).toBeUndefined();
  });
});

describe('combat — COOLDOWN REGRESSION', () => {
  it('Fighter(type 1) の cooldown は dt 分だけ減少する', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    unit(fighter).cooldown = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.1, 0, rng);
    expect(unit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('Beam unit(Cruiser type 3) の cooldown も dt 分だけ減少する（二重デクリメントしない）', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).target = enemy;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).cooldown).toBeCloseTo(0.9);
  });
});

describe('combat — SWEEP BEAM (CD-triggered)', () => {
  it('IDLE: cooldown>0 → スイープ不発、beamOn減衰', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(beams.length).toBe(0);
  });

  it('cooldown満了 → スイープ開始 (sweepPhase>0, beamOn=1)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(unit(cruiser).sweepPhase).toBeGreaterThan(0);
    expect(unit(cruiser).beamOn).toBe(1);
  });

  it('sweepPhase進行: += dt / SWEEP_DURATION', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.2;
    unit(cruiser).sweepBaseAngle = 0;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).sweepPhase).toBeCloseTo(0.2 + dt / SWEEP_DURATION);
  });

  it('スイープ完了 → CDリセット (sweepPhase=0, cooldown=1.5)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.9;
    unit(cruiser).sweepBaseAngle = 0;
    buildHash();
    // 0.9 + 0.1/SWEEP_DURATION > 1 → 完了
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).cooldown).toBeCloseTo(unitType(3).fireRate);
  });

  it('sweep-through命中: arc中心付近の敵にdamage=8', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    const cruiserType = unitType(3);
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBe(hpBefore - cruiserType.damage);
  });

  it('arc外ミス: 全スイープ実行しても遠方の敵は無傷', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const farEnemy = spawnAt(1, 1, 0, 200); // 90°方向 → arc外
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    unit(cruiser).angle = 0;
    buildHash();
    const hpBefore = unit(farEnemy).hp;
    for (let i = 0; i < 30; i++) {
      combat(unit(cruiser), cruiser, 0.016, 0, rng);
    }
    expect(unit(farEnemy).hp).toBe(hpBefore);
  });

  it('Bastion死亡済み参照: 孤児テザー軽減がビームに適用される', () => {
    const cruiserType = unitType(3);
    const cruiser = spawnAt(0, 3, 0, 0);
    const bastion = spawnAt(1, 15, 0, 200);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(enemy).shieldLingerTimer = 1.0;
    unit(enemy).shieldSourceUnit = bastion;
    // Bastion を死亡状態にする
    unit(bastion).alive = false;
    decUnits();
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - cruiserType.damage * ORPHAN_TETHER_BEAM_MULT);
    expect(unit(enemy).shieldSourceUnit).toBe(NO_UNIT);
  });

  it('孤児テザー（sourceUnit未設定）: 軽減ダメージ適用', () => {
    const cruiserType = unitType(3);
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(enemy).shieldLingerTimer = 1.0;
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - cruiserType.damage * ORPHAN_TETHER_BEAM_MULT);
  });

  it('敵kill: hp<=0 → killUnit', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 0, 200, 0); // Drone hp=3
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).alive).toBe(false);
  });

  it('ターゲットロスト → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0.3;
    unit(cruiser).target = NO_UNIT;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(beams.length).toBe(0);
  });

  it('ビーム描画: SWEEPING中のみaddBeam', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.5;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('IDLE中はビーム描画なし', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBe(0);
  });

  it('DPS検証: 2-5の範囲', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).angle = 0;
    unit(enemy).hp = 9999;
    buildHash();
    const hpBefore = unit(enemy).hp;
    for (let i = 0; i < 300; i++) {
      combat(unit(cruiser), cruiser, 0.033, 0, rng);
    }
    const totalDmg = hpBefore - unit(enemy).hp;
    const dps = totalDmg / (300 * 0.033);
    expect(dps).toBeGreaterThanOrEqual(2);
    expect(dps).toBeLessThanOrEqual(5);
  });

  it('距離>=range → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > range=350
    unit(cruiser).target = enemy;
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0.3;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(unit(cruiser).sweepPhase).toBe(0);
  });
});

describe('combat — FOCUS BEAM', () => {
  it('beamOn が dt×0.8 で蓄積', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 0;
    unit(frig).cooldown = 999;
    buildHash();
    combat(unit(frig), frig, 0.1, 0, rng);
    expect(unit(frig).beamOn).toBeCloseTo(0.08);
  });

  it('beamOn の上限は 2.0', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 1.95;
    unit(frig).cooldown = 999;
    buildHash();
    combat(unit(frig), frig, 0.1, 0, rng);
    expect(unit(frig).beamOn).toBeCloseTo(2.0);
  });

  it('ターゲット死亡で beamOn リセット', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 1.5;
    unit(frig).cooldown = 0;
    unit(enemy).hp = 0.1;
    buildHash();
    combat(unit(frig), frig, 0.016, 0, rng);
    expect(unit(frig).beamOn).toBe(0);
  });

  it('ダメージは damage × beamOn × vd', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 1.5;
    unit(frig).cooldown = 0;
    unit(frig).vet = 0;
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(frig), frig, 0.016, 0, rng);
    const expectedDmg = 0.8 * (1.5 + 0.016 * 0.8) * 1.0;
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - expectedDmg);
  });

  it('ビーム幅は (2 + beamOn * 2)', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 1.0;
    unit(frig).cooldown = 999;
    buildHash();
    combat(unit(frig), frig, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
    const expectedBeamOn = 1.0 + 0.016 * 0.8;
    const b = beams[0];
    expect(b).toBeDefined();
    if (b) expect(b.width).toBeCloseTo(2 + expectedBeamOn * 2);
  });

  it('beamOn=0 → ヒットパーティクル1個', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 0;
    unit(frig).cooldown = 0;
    unit(enemy).hp = 9999;
    buildHash();
    combat(unit(frig), frig, 0.016, 0, rng);
    // beamOn=0+dt*0.8≈0.0128 → floor(0.0128*2)=0 → 1+0=1個
    expect(poolCounts.particles).toBe(1);
  });

  it('beamOn=2 → ヒットパーティクル5個', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).beamOn = 2;
    unit(frig).cooldown = 0;
    unit(enemy).hp = 9999;
    buildHash();
    combat(unit(frig), frig, 0.016, 0, rng);
    // beamOn=2(clamped) → floor(2*2)=4 → 1+4=5個
    expect(poolCounts.particles).toBe(5);
  });

  it('DPS検証: 10秒で Scorcher DPS ≈ 8-16', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(frig).target = enemy;
    unit(frig).cooldown = 0;
    unit(frig).beamOn = 0;
    unit(frig).vet = 0;
    unit(enemy).hp = 9999;
    buildHash();
    const hpBefore = unit(enemy).hp;
    for (let i = 0; i < 300; i++) {
      combat(unit(frig), frig, 0.033, 0, rng);
    }
    const totalDmg = hpBefore - unit(enemy).hp;
    const dps = totalDmg / (300 * 0.033);
    expect(dps).toBeGreaterThanOrEqual(6);
    expect(dps).toBeLessThanOrEqual(18);
  });
});

describe('combat — DRONE SWARM', () => {
  it('孤立 Drone: ダメージ倍率 ×1.0', () => {
    const drone = spawnAt(0, 0, 0, 0); // Drone (swarm, dmg=1)
    const enemy = spawnAt(1, 1, 50, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    // dmg = 1 * 1.0 (vd) * 1.0 (no allies) = 1.0
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('味方 Drone 3体: ダメージ倍率 ×1.45', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 味方 Drone を周囲に 3体配置 (80以内)
    spawnAt(0, 0, 20, 0);
    spawnAt(0, 0, -20, 0);
    spawnAt(0, 0, 0, 20);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    // dmg = 1 * 1.0 * (1 + 3*0.15) = 1.45
    expect(projectile(0).damage).toBeCloseTo(1.45);
  });

  it('味方 6+体: 上限 ×1.9', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    for (let i = 0; i < 8; i++) {
      spawnAt(0, 0, 10 + i * 5, 10);
    }
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    // min(8, 6) * 0.15 = 0.9 → dmg = 1 * 1.9
    expect(projectile(0).damage).toBeCloseTo(1.9);
  });

  it('他タイプの味方は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // Fighter (type=1) は同型ではないのでカウントされない
    spawnAt(0, 1, 20, 0);
    spawnAt(0, 1, -20, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('敵チームの同型は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 敵チームの Drone
    spawnAt(1, 0, 20, 0);
    spawnAt(1, 0, -20, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('孤立 Drone: プロジェクタイル size/color は変化なし', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    const p = projectile(0);
    expect(p.size).toBeCloseTo(2.05);
    expect(p.r).toBeCloseTo(0.242, 2);
    expect(p.g).toBeCloseTo(1.0, 2);
    expect(p.b).toBeCloseTo(0.452, 2);
  });

  it('味方 6体: プロジェクタイル size 拡大 + 白寄りの色', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    for (let i = 0; i < 6; i++) {
      spawnAt(0, 0, 10 + i * 5, 10);
    }
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    const p = projectile(0);
    // dmgMul=1.9, sizeMul=1+(0.9)*0.5=1.45, size=2.05*1.45=2.9725
    expect(p.size).toBeCloseTo(2.9725);
    // wb=(1.9-1)*0.4=0.36
    expect(p.r).toBeCloseTo(0.242 + (1 - 0.242) * 0.36, 2);
    expect(p.g).toBeCloseTo(1.0 + (1 - 1.0) * 0.36, 2);
    expect(p.b).toBeCloseTo(0.452 + (1 - 0.452) * 0.36, 2);
  });
});

describe('combat — FIGHTER BURST', () => {
  it('初発でバーストカウント開始 (burst=3 → burstCount=2 after shot)', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (burst=3)
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(unit(fighter).burstCount).toBe(2);
  });

  it('バースト中間: cooldown = BURST_INTERVAL (0.07)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    // burstCount=2 (>0) → cooldown = 0.07
    expect(unit(fighter).cooldown).toBeCloseTo(0.07);
  });

  it('最終弾: cooldown = fireRate (0.9)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 1; // 残り1発
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    // burstCount=0 → cooldown = fireRate = 0.9
    expect(unit(fighter).burstCount).toBe(0);
    expect(unit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('ターゲットロスト → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    unit(fighter).burstCount = 2;
    unit(fighter).target = NO_UNIT;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).burstCount).toBe(0);
  });

  it('ターゲット死亡 → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 2;
    unit(fighter).target = enemy;
    unit(enemy).alive = false;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).burstCount).toBe(0);
    expect(unit(fighter).target).toBe(NO_UNIT);
  });
});

describe('getDominantDemoFlag', () => {
  it.each([
    [0, 'swarm'],
    [1, 'burst'],
    [2, 'carpet'],
    [3, 'sweep'],
    [4, 'broadside'],
    [5, 'heals'],
    [6, 'reflects'],
    [7, 'spawns'],
    [8, null], // Sniper: railgun は shape===8 分岐で DemoFlag 対象外
    [9, 'rams'],
    [10, 'homing'],
    [11, 'emp'],
    [12, 'beam'],
    [13, 'teleports'],
    [14, 'chain'],
  ] as const)('TYPES[%i] → %s', (idx, expected) => {
    expect(demoFlag(unitType(idx))).toBe(expected);
  });

  it('Bomber (carpet+aoe): carpet が aoe より優先', () => {
    const t = unitType(2);
    expect(t.carpet).toBeTruthy();
    expect(t.aoe).toBeTruthy();
    expect(demoFlag(t)).toBe('carpet');
  });

  it('Launcher (homing+burst): homing が burst より優先', () => {
    const t = unitType(10);
    expect(t.homing).toBeTruthy();
    expect(t.burst).toBeTruthy();
    expect(demoFlag(t)).toBe('homing');
  });

  it('フラグなしユニット → null', () => {
    expect(demoFlag(unitType(8))).toBeNull();
  });
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
    expect(poolCounts.projectiles).toBe(1);
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

  it('Sniper: 移動目標への偏差が大きい (leadAccuracy=0.95)', () => {
    const sniper = spawnAt(0, 8, 0, 0);
    const enemy = spawnAt(1, 1, 300, 0);
    unit(enemy).vy = 150;
    unit(sniper).cooldown = 0;
    unit(sniper).target = enemy;
    buildHash();
    combat(unit(sniper), sniper, 0.016, 0, rng);
    const p = projectile(0);
    // 弾のvy成分が正（上方向にリード）
    expect(p.vy).toBeGreaterThan(0);
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

describe('combat — BEAM REFLECT (リトロリフレクション)', () => {
  it('攻撃元に直接ダメージが返る', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const expectedDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0 * REFLECT_BEAM_DAMAGE_MULT;
    expect(unit(scorcher).hp).toBeCloseTo(hpBefore - expectedDmg);
    expect(unit(scorcher).hitFlash).toBe(1);
  });

  it('Reflector の angle に依存せず攻撃元にダメージ', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);
    unit(reflector).angle = -Math.PI / 4; // 斜め向き

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).hp).toBeLessThan(hpBefore);
  });

  it('第三者にはダメージが及ばない', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);
    const bystander = spawnAt(0, 1, 0, 200);
    unit(bystander).hp = 100;

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(bystander).hp).toBe(100);
  });

  it('反射ビームが攻撃元に向かって描画される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // 反射ビーム + 元のフォーカスビーム
    expect(beams.length).toBeGreaterThanOrEqual(2);
    // 反射ビームの終点が攻撃元に向いている
    const reflBeam = beams.find((b) => b.x1 === unit(reflector).x && b.y1 === unit(reflector).y);
    expect(reflBeam).toBeDefined();
    if (reflBeam) {
      expect(reflBeam.x2).toBe(unit(scorcher).x);
      expect(reflBeam.y2).toBe(unit(scorcher).y);
    }
  });

  it('攻撃元が kill される場合', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    unit(scorcher).hp = 0.01; // ほぼ死亡
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).alive).toBe(false);
  });

  it('Sweep beam + Reflector でバッファ競合なく動作する', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const reflector = spawnAt(1, 6, 200, 0);

    unit(cruiser).target = reflector;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
  });

  it('Sweep中にReflector反射でattackerが死亡 → 例外なく中断', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const reflector = spawnAt(1, 6, 80, 0);

    unit(cruiser).target = reflector;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(cruiser).hp = 0.01; // 反射ダメージで死亡する程度のHP
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
    expect(unit(cruiser).alive).toBe(false);
  });
});

describe('combat — FIELD BEAM REFLECT (reflectFieldHp によるビーム反射)', () => {
  it('フィールド持ち味方がビームを反射しダメージを返却する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0); // Drone (non-reflector)
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const baseDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0;
    const expectedDmg = baseDmg * REFLECT_BEAM_DAMAGE_MULT;
    expect(unit(scorcher).hp).toBeCloseTo(hpBefore - expectedDmg);
    expect(unit(scorcher).hitFlash).toBe(1);
    // allyのHPは変化しない（反射成功でダメージスキップ）
    expect(unit(ally).hp).toBe(100);
  });

  it('フィールドHPがビームダメージ分減少する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const baseDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0;
    expect(unit(ally).reflectFieldHp).toBeCloseTo(REFLECT_FIELD_MAX_HP - baseDmg);
  });

  it('フィールドHP枯渇後はビームが貫通する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = 0;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const attackerHpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // 攻撃者のHPは変化しない（反射されない）
    expect(unit(scorcher).hp).toBe(attackerHpBefore);
    // allyはダメージを受ける
    expect(unit(ally).hp).toBeLessThan(100);
  });

  it('反射ダメージで攻撃者がkillされる', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    unit(scorcher).hp = 0.01;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).alive).toBe(false);
  });

  it('反射ビームが攻撃元に向かって描画される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const reflBeam = beams.find((b) => b.x1 === unit(ally).x && b.y1 === unit(ally).y);
    expect(reflBeam).toBeDefined();
    if (reflBeam) {
      expect(reflBeam.x2).toBe(unit(scorcher).x);
      expect(reflBeam.y2).toBe(unit(scorcher).y);
    }
  });

  it('フィールドHPがダメージ以下の場合0に固定される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = 0.1; // ダメージより小さい

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(ally).reflectFieldHp).toBe(0);
  });

  it('Reflector本体のenergy反射がフィールド反射より優先される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0); // Reflector本体
    unit(reflector).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    const energyBefore = unit(reflector).energy;

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // Reflector本体のenergyが消費される（tryReflectBeamが先に発火）
    expect(unit(reflector).energy).toBeLessThan(energyBefore);
    // フィールドHPは消費されない
    expect(unit(reflector).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('Sweep Beamがフィールドで反射される', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const ally = spawnAt(1, 1, 80, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(cruiser).target = ally;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    const cruiserHpBefore = unit(cruiser).hp;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);

    // Sweep beam が反射されて攻撃者がダメージを受ける
    expect(unit(cruiser).hp).toBeLessThan(cruiserHpBefore);
    // allyのHPは変化しない（反射成功でダメージスキップ）
    expect(unit(ally).hp).toBe(100);
  });

  it('Sweep中にフィールド反射でattackerが死亡 → 例外なく中断', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const ally = spawnAt(1, 1, 80, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(cruiser).target = ally;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(cruiser).hp = 0.01;
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
    expect(unit(cruiser).alive).toBe(false);
  });
});

// ============================================================
// Amplifier buff effects
// ============================================================
describe('combat — AMPLIFIER buff effects', () => {
  const AMPLIFIER_TYPE = 16; // Amplifier index
  const FIGHTER_TYPE_C = 1;

  it('ampBoostTimer > 0 のユニットの射程が AMP_RANGE_MULT 倍に拡張', () => {
    const t = unitType(FIGHTER_TYPE_C);
    const baseRange = t.range;
    const extendedRange = baseRange * AMP_RANGE_MULT;

    // 基本射程外、バフ射程内に敵を配置
    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, baseRange + 5, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).ampBoostTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);

    // バフにより射程が拡張されるので射撃が発生
    expect(baseRange + 5).toBeLessThan(extendedRange);
    // cooldownがリセットされていれば射撃が発生した証拠
    expect(unit(fighter).cooldown).toBeGreaterThan(0);
  });

  it('ampBoostTimer = 0 では射程拡張なし', () => {
    const t = unitType(FIGHTER_TYPE_C);
    const baseRange = t.range;

    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, baseRange + 5, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).ampBoostTimer = 0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);

    // 射程外なので射撃せず、cooldownは0以下のまま
    expect(unit(fighter).cooldown).toBeLessThanOrEqual(0);
  });

  it('ampBoostTimer > 0 のユニットが AMP_DAMAGE_MULT 倍のダメージを与える', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).ampBoostTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(projectile(0).damage).toBeCloseTo(unitType(FIGHTER_TYPE_C).damage * AMP_DAMAGE_MULT);
  });

  it('Amplifier は非排他で通常射撃にフォールスルーする', () => {
    const amp = spawnAt(0, AMPLIFIER_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, 100, 0);
    unit(amp).target = enemy;
    unit(amp).cooldown = 0;
    buildHash();
    combat(unit(amp), amp, 0.016, 0, rng);
    // Amplifierは通常射撃にフォールスルーするのでcooldownがfireRate以上にリセットされる
    expect(unit(amp).cooldown).toBeGreaterThan(0);
  });

  it('demoFlag は amplifies を返す', () => {
    expect(demoFlag(unitType(AMPLIFIER_TYPE))).toBe('amplifies');
  });
});

// ============================================================
// KillEvent 伝播テスト
// ============================================================
describe('combat — KillEvent 伝播', () => {
  it('handleRam: 敵kill時の KillEvent に攻撃者情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
      }),
    );
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3)
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(9);
  });

  it('handleRam: 相打ち時に双方の KillEvent が正しい killer 情報を持つ', () => {
    const events: { victimTeam: number; killerTeam: number | undefined }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        events.push({ victimTeam: e.victimTeam, killerTeam: e.killerTeam });
      }),
    );
    const lancer = spawnAt(0, 9, 0, 0);
    unit(lancer).hp = 1; // 自傷で死亡
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3, mass=1)
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // Drone は Lancer の衝突ダメージで死亡、Lancer は自傷 ceil(Drone.mass)=1 で死亡
    expect(unit(enemy).alive).toBe(false);
    expect(unit(lancer).alive).toBe(false);
    expect(events).toHaveLength(2);
    const enemyKill = events.find((e) => e.victimTeam === 1);
    const lancerKill = events.find((e) => e.victimTeam === 0);
    expect(enemyKill?.killerTeam).toBe(0); // lancer が killer
    expect(lancerKill?.killerTeam).toBe(1); // drone が killer
  });

  it('handleFocusBeam: 敵kill時の KillEvent に射撃元情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
      }),
    );
    const scorcher = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 0, 100, 0); // Drone hp=3
    unit(enemy).hp = 0.1; // 最小HPでkill確定
    unit(scorcher).target = enemy;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 2.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(12);
  });
});
