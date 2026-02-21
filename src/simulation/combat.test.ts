import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_UNITS } from '../constants.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import type { ProjectileIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { killProjectile, spawnProjectile } from './spawn.ts';
import { updateSwarmN } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { _resetSweepHits, aimAt, combat, demoFlag, resetReflected } from './combat.ts';

afterEach(() => {
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
    const lancer = spawnAt(0, 9, 0, 0); // Lancer (mass=12)
    const enemy = spawnAt(1, 1, 5, 0); // Fighter (mass=2, size=7)
    buildHash();
    const lancerHpBefore = unit(lancer).hp;
    const enemyHpBefore = unit(enemy).hp;
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // Lancer (size=12) + Fighter (size=7) = 19, distance = 5 < 19 → 衝突
    // vet=0: vd = 1 + 0*0.2 = 1
    // enemy damage: ceil(12 * 3 * 1) = 36
    expect(unit(enemy).hp).toBe(enemyHpBefore - 36);
    // self damage: ceil(Fighter.mass) = ceil(2) = 2
    expect(unit(lancer).hp).toBe(lancerHpBefore - 2);
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
  it('味方HP回復 (hp+3, 上限maxHp)', () => {
    const healer = spawnAt(0, 5, 0, 0); // Healer
    const ally = spawnAt(0, 1, 50, 0); // Fighter (hp=10, maxHp=10)
    unit(healer).abilityCooldown = 0; // クールダウン切れ
    unit(ally).hp = 5; // ダメージ受けた状態
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(ally).hp).toBe(8); // 5 + 3
  });

  it('hp上限 (maxHp) を超えない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 9; // maxHp=10, hp=9 → +3 → clamp to 10
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(ally).hp).toBe(10);
  });

  it('abilityCooldown=0.35 にリセットされる', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(healer).abilityCooldown = 0;
    unit(ally).hp = 5;
    buildHash();
    combat(unit(healer), healer, 0.016, 0, rng);
    expect(unit(healer).abilityCooldown).toBeCloseTo(0.35);
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
    const disruptor = spawnAt(0, 11, 0, 0); // Disruptor (rng=200, damage=2)
    const enemy = spawnAt(1, 1, 100, 0);
    unit(disruptor).abilityCooldown = 0;
    unit(disruptor).target = enemy;
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(disruptor), disruptor, 0.016, 0, rng);
    expect(unit(enemy).stun).toBe(1.5);
    expect(unit(enemy).hp).toBe(hpBefore - 2); // damage=2
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

describe('combat — TELEPORTER', () => {
  it('距離80-500でテレポート + 5発射撃', () => {
    const tp = spawnAt(0, 13, 0, 0); // Teleporter
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 0; // クールダウン切れ
    unit(tp).target = enemy;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    // テレポート後: tp > 0 にリセット
    expect(unit(tp).teleportTimer).toBeGreaterThan(0);
    // テレポート射撃5発（combat内ループ）+ NORMAL FIRE フォールスルー1発 = 計6
    expect(poolCounts.projectiles).toBe(6);
    // パーティクル生成（テレポートエフェクト）
    expect(poolCounts.particles).toBeGreaterThan(0);
  });

  it('tp>0 では何もしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(tp).teleportTimer = 3.0; // クールダウン中
    unit(tp).target = enemy;
    unit(tp).cooldown = 999; // NORMAL FIREも防ぐ
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    // tp はdt分減少するだけ
    expect(unit(tp).teleportTimer).toBeCloseTo(3.0 - 0.016);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('距離が80未満ではテレポートしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 30, 0); // 距離 30 < 80
    unit(tp).teleportTimer = 0;
    unit(tp).target = enemy;
    unit(tp).cooldown = 999;
    buildHash();
    combat(unit(tp), tp, 0.016, 0, rng);
    // tp -= dt は常に実行されるのでtp = 0 - 0.016
    expect(unit(tp).teleportTimer).toBeCloseTo(-0.016);
    expect(poolCounts.projectiles).toBe(0);
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
    // Fighter はバースト中なので中間クールダウン (0.07)
    expect(unit(fighter).cooldown).toBeCloseTo(0.07);
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
    // Fighter damage=2, vet=1 → 2 * 1.2 = 2.4
    expect(projectile(0).damage).toBeCloseTo(2.4);
  });

  it('vet=2: damage×1.4', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).vet = 2;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    // Fighter damage=2, vet=2 → 2 * 1.4 = 2.8
    expect(projectile(0).damage).toBeCloseTo(2.8);
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
    expect(unit(launcher).cooldown).toBeCloseTo(2.8, 1);
  });

  it('aoe: AOEプロジェクタイル生成', () => {
    const bomber = spawnAt(0, 2, 0, 0); // Bomber (aoe=42)
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(42);
  });

  it('carpet: Bomber → 4発AOEプロジェクタイル (carpet bomb)', () => {
    const bomber = spawnAt(0, 2, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();

    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(42);
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
    expect(unit(bomber).cooldown).toBeCloseTo(2.8, 1);
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

  it('Beam Frig(type 12) の fireRate は 0.1', () => {
    expect(unitType(12).fireRate).toBe(0.1);
  });

  it('Beam Frig の damage は 0.8', () => {
    expect(unitType(12).damage).toBe(0.8);
  });

  it('Beam Frig に sweep がない', () => {
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
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
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

  it('sweepPhase進行: += dt / SWEEP_DURATION(0.8)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.2;
    unit(cruiser).sweepBaseAngle = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    // 0.2 + 0.1/0.8 = 0.325
    expect(unit(cruiser).sweepPhase).toBeCloseTo(0.325);
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
    // dt=0.1 → 0.9 + 0.1/0.8 = 1.025 → clamped to 1 → complete
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).cooldown).toBeCloseTo(1.5);
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
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBe(hpBefore - 8);
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

  it('shielded 60%軽減: 8 * 0.4 = 3.2', () => {
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
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - 3.2);
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
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
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
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
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

  it('DPS検証: 10秒で Beam Frig DPS ≈ 8-16', () => {
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
    expect(p.r).toBeCloseTo(0.2);
    expect(p.g).toBeCloseTo(1);
    expect(p.b).toBeCloseTo(0.55);
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
    expect(p.r).toBeCloseTo(0.2 + 0.8 * 0.36);
    expect(p.g).toBeCloseTo(1 + 0 * 0.36);
    expect(p.b).toBeCloseTo(0.55 + 0.45 * 0.36);
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
