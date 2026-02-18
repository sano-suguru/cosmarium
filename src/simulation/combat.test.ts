import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getProjectile, getUnit, poolCounts } from '../pools.ts';
import { beams, rng } from '../state.ts';
import type { ProjectileIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { killProjectile, spawnProjectile } from './spawn.ts';
import { updateSwarmN } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { _resetSweepHits, combat, resetReflectedSet } from './combat.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflectedSet();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('combat — 共通', () => {
  it('stun>0 → 即return（何も起きない）', () => {
    const idx = spawnAt(0, 1, 0, 0);
    const u = getUnit(idx);
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
    const u = getUnit(idx);
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
    const lancerHpBefore = getUnit(lancer).hp;
    const enemyHpBefore = getUnit(enemy).hp;
    combat(getUnit(lancer), lancer, 0.016, 0, rng);
    // Lancer (size=12) + Fighter (size=7) = 19, distance = 5 < 19 → 衝突
    // vet=0: vd = 1 + 0*0.2 = 1
    // enemy damage: ceil(12 * 3 * 1) = 36
    expect(getUnit(enemy).hp).toBe(enemyHpBefore - 36);
    // self damage: ceil(Fighter.mass) = ceil(2) = 2
    expect(getUnit(lancer).hp).toBe(lancerHpBefore - 2);
  });

  it('衝突でノックバック発生', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 1, 5, 0);
    getUnit(enemy).vx = 0;
    getUnit(enemy).vy = 0;
    buildHash();
    combat(getUnit(lancer), lancer, 0.016, 0, rng);
    // ノックバックで敵のvxが変化
    expect(getUnit(enemy).vx).not.toBe(0);
  });

  it('敵HP<=0 → killUnit + explosion', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3, size=4)
    buildHash();
    combat(getUnit(lancer), lancer, 0.016, 0, rng);
    // Lancer damage = ceil(12*3*1) = 36 >> 3 → 敵は死亡
    expect(getUnit(enemy).alive).toBe(false);
  });

  it('自身HP<=0 → 自身も死亡', () => {
    const lancer = spawnAt(0, 9, 0, 0);
    getUnit(lancer).hp = 1; // HP1にする
    spawnAt(1, 4, 5, 0); // Flagship (mass=30)
    buildHash();
    combat(getUnit(lancer), lancer, 0.016, 0, rng);
    // self damage = ceil(Flagship.mass) = ceil(30) = 30 >> 1
    expect(getUnit(lancer).alive).toBe(false);
  });
});

describe('combat — HEALER', () => {
  it('味方HP回復 (hp+3, 上限maxHp)', () => {
    const healer = spawnAt(0, 5, 0, 0); // Healer
    const ally = spawnAt(0, 1, 50, 0); // Fighter (hp=10, maxHp=10)
    getUnit(healer).abilityCooldown = 0; // クールダウン切れ
    getUnit(ally).hp = 5; // ダメージ受けた状態
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(getUnit(ally).hp).toBe(8); // 5 + 3
  });

  it('hp上限 (maxHp) を超えない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 9; // maxHp=10, hp=9 → +3 → clamp to 10
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(getUnit(ally).hp).toBe(10);
  });

  it('abilityCooldown=0.35 にリセットされる', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 5;
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(getUnit(healer).abilityCooldown).toBeCloseTo(0.35);
  });

  it('自身は回復しない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(healer).hp = 5;
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(getUnit(healer).hp).toBe(5); // 変化なし
  });

  it('回復ビームが追加される', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 5;
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('abilityCooldown>0 → 回復スキップ', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 1.0;
    getUnit(ally).hp = 5;
    buildHash();
    combat(getUnit(healer), healer, 0.016, 0, rng);
    expect(getUnit(ally).hp).toBe(5);
  });
});

describe('combat — REFLECTOR', () => {
  it('本体付近の敵弾を法線ベースで反射 + team変更', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = getProjectile(0);
    expect(p.team).toBe(1);
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.team).toBe(0);
  });

  it('反射距離外の敵弾は反射しない', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(50, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = getProjectile(0);
    const vxBefore = p.vx;
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBe(vxBefore);
    expect(p.team).toBe(1);
  });

  it('自チーム弾は反射しない', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 0, 2, 1, 0, 0);
    const p = getProjectile(0);
    const vxBefore = p.vx;
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(p.vx).toBe(vxBefore);
  });

  it('反射後に p.life が REFLECT_LIFE(0.5) にリセットされる', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 0.1, 5, 1, 2, 1, 0, 0);
    const p = getProjectile(0);
    expect(p.life).toBeCloseTo(0.1);
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(p.life).toBeCloseTo(0.5);
  });

  it('反射後の弾速が元と同等（加速しない）', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = getProjectile(0);
    const speedBefore = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    const speedAfter = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    expect(speedAfter).toBeCloseTo(speedBefore, 1);
  });

  it('cooldown<=0 かつ target あり → 射撃', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    getUnit(reflector).cooldown = 0;
    getUnit(reflector).target = enemy;
    buildHash();
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getProjectile(0).team).toBe(0);
    expect(getUnit(reflector).cooldown).toBeCloseTo(getUnitType(6).fireRate);
  });

  it('dead弾をスキップしてlive敵弾を正しく反射する', () => {
    const reflector = spawnAt(0, 6, 0, 0);
    buildHash();
    // slot 0, 1 にlive敵弾を作り、slot 0 をkillしてdead状態にする
    spawnProjectile(10, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    spawnProjectile(20, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    killProjectile(0 as ProjectileIndex);
    expect(getProjectile(0).alive).toBe(false);
    expect(getProjectile(1).alive).toBe(true);
    expect(getProjectile(1).team).toBe(1);
    combat(getUnit(reflector), reflector, 0.016, 0, rng);
    expect(getProjectile(1).team).toBe(0);
    expect(getProjectile(1).vx).toBeGreaterThan(0);
  });

  it('同一フレーム内で2体のReflectorが同じ弾を二重反射しない', () => {
    const r1 = spawnAt(0, 6, 0, 0);
    const r2 = spawnAt(0, 6, 25, 0);
    buildHash();
    spawnProjectile(12, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0);
    const p = getProjectile(0);
    combat(getUnit(r1), r1, 0.016, 0, rng);
    expect(p.team).toBe(0);
    const vxAfterFirst = p.vx;
    combat(getUnit(r2), r2, 0.016, 0, rng);
    expect(p.vx).toBe(vxAfterFirst);
    expect(p.team).toBe(0);
  });
});

describe('combat — CARRIER', () => {
  it('spawnCooldown<=0 で Drone×4 スポーン', () => {
    const carrier = spawnAt(0, 7, 0, 0); // Carrier
    getUnit(carrier).spawnCooldown = 0; // クールダウン切れ
    const ucBefore = poolCounts.unitCount;
    buildHash();
    combat(getUnit(carrier), carrier, 0.016, 0, rng);
    // Drone×4 生成
    expect(poolCounts.unitCount).toBe(ucBefore + 4);
    // Drone (type=0) が生成されている
    let drones = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive && getUnit(i).type === 0 && i !== carrier) drones++;
    }
    expect(drones).toBe(4);
  });

  it('spawnCooldown > 0 → スポーンなし', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    getUnit(carrier).spawnCooldown = 5.0;
    const ucBefore = poolCounts.unitCount;
    buildHash();
    combat(getUnit(carrier), carrier, 0.016, 0, rng);
    expect(poolCounts.unitCount).toBe(ucBefore);
  });

  it('spawnCooldown リセット', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    getUnit(carrier).spawnCooldown = 0;
    buildHash();
    combat(getUnit(carrier), carrier, 0.016, 0, rng);
    // spawnCooldown = 4 + random * 2 (PRNG sequence value)
    expect(getUnit(carrier).spawnCooldown).toBeGreaterThan(4);
    expect(getUnit(carrier).spawnCooldown).toBeLessThan(6);
  });
});

describe('combat — DISRUPTOR', () => {
  it('範囲内の敵にstun=1.5 + ダメージ', () => {
    const disruptor = spawnAt(0, 11, 0, 0); // Disruptor (rng=200, damage=2)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(disruptor).abilityCooldown = 0;
    getUnit(disruptor).target = enemy;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(disruptor), disruptor, 0.016, 0, rng);
    expect(getUnit(enemy).stun).toBe(1.5);
    expect(getUnit(enemy).hp).toBe(hpBefore - 2); // damage=2
  });

  it('tgt<0 → 即return', () => {
    const disruptor = spawnAt(0, 11, 0, 0);
    getUnit(disruptor).abilityCooldown = 0;
    getUnit(disruptor).target = NO_UNIT;
    buildHash();
    combat(getUnit(disruptor), disruptor, 0.016, 0, rng);
    expect(poolCounts.particleCount).toBe(0); // パーティクルなし = 何も実行されず
  });

  it('味方にスタンはかからない', () => {
    const disruptor = spawnAt(0, 11, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(disruptor).abilityCooldown = 0;
    getUnit(disruptor).target = enemy;
    buildHash();
    combat(getUnit(disruptor), disruptor, 0.016, 0, rng);
    expect(getUnit(ally).stun).toBe(0);
    expect(getUnit(enemy).stun).toBe(1.5);
  });
});

describe('combat — TELEPORTER', () => {
  it('距離80-500でテレポート + 5発射撃', () => {
    const tp = spawnAt(0, 13, 0, 0); // Teleporter
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(tp).teleportTimer = 0; // クールダウン切れ
    getUnit(tp).target = enemy;
    buildHash();
    combat(getUnit(tp), tp, 0.016, 0, rng);
    // テレポート後: tp > 0 にリセット
    expect(getUnit(tp).teleportTimer).toBeGreaterThan(0);
    // テレポート射撃5発（combat内ループ）+ NORMAL FIRE フォールスルー1発 = 計6
    expect(poolCounts.projectileCount).toBe(6);
    // パーティクル生成（テレポートエフェクト）
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });

  it('tp>0 では何もしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(tp).teleportTimer = 3.0; // クールダウン中
    getUnit(tp).target = enemy;
    getUnit(tp).cooldown = 999; // NORMAL FIREも防ぐ
    buildHash();
    combat(getUnit(tp), tp, 0.016, 0, rng);
    // tp はdt分減少するだけ
    expect(getUnit(tp).teleportTimer).toBeCloseTo(3.0 - 0.016);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('距離が80未満ではテレポートしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 30, 0); // 距離 30 < 80
    getUnit(tp).teleportTimer = 0;
    getUnit(tp).target = enemy;
    getUnit(tp).cooldown = 999;
    buildHash();
    combat(getUnit(tp), tp, 0.016, 0, rng);
    // tp -= dt は常に実行されるのでtp = 0 - 0.016
    expect(getUnit(tp).teleportTimer).toBeCloseTo(-0.016);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

describe('combat — CHAIN LIGHTNING', () => {
  it('chainLightning() 呼出 + cooldownリセット', () => {
    const arcer = spawnAt(0, 14, 0, 0); // Arcer (rng=250, fireRate=2)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(arcer).cooldown = 0;
    getUnit(arcer).target = enemy;
    buildHash();
    combat(getUnit(arcer), arcer, 0.016, 0, rng);
    // cooldown = fireRate = 2
    expect(getUnit(arcer).cooldown).toBeCloseTo(getUnitType(14).fireRate);
    // ビーム + ダメージ
    expect(beams.length).toBeGreaterThan(0);
  });

  it('tgt<0 → 即return', () => {
    const arcer = spawnAt(0, 14, 0, 0);
    getUnit(arcer).cooldown = 0;
    getUnit(arcer).target = NO_UNIT;
    buildHash();
    combat(getUnit(arcer), arcer, 0.016, 0, rng);
    expect(beams.length).toBe(0);
  });
});

describe('combat — NORMAL FIRE', () => {
  it('射程内で cooldown<=0 → プロジェクタイル発射', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170, fireRate=0.9, burst=3)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    // Fighter はバースト中なので中間クールダウン (0.07)
    expect(getUnit(fighter).cooldown).toBeCloseTo(0.07);
  });

  it('射程外 → プロジェクタイルなし', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170)
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > rng
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('vet=1: damage×1.2', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    getUnit(fighter).vet = 1;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    // Fighter damage=2, vet=1 → 2 * 1.2 = 2.4
    expect(getProjectile(0).damage).toBeCloseTo(2.4);
  });

  it('vet=2: damage×1.4', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    getUnit(fighter).vet = 2;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    // Fighter damage=2, vet=2 → 2 * 1.4 = 2.8
    expect(getProjectile(0).damage).toBeCloseTo(2.8);
  });

  it('homing: ホーミングプロジェクタイル生成', () => {
    const launcher = spawnAt(0, 10, 0, 0); // Launcher (homing=true)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(launcher).cooldown = 0;
    getUnit(launcher).target = enemy;
    buildHash();
    combat(getUnit(launcher), launcher, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getProjectile(0).homing).toBe(true);
    expect(getProjectile(0).targetIndex).toBe(enemy);
  });

  it('aoe: AOEプロジェクタイル生成', () => {
    const bomber = spawnAt(0, 2, 0, 0); // Bomber (aoe=70)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(bomber).cooldown = 0;
    getUnit(bomber).target = enemy;
    buildHash();
    combat(getUnit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getProjectile(0).aoe).toBe(70);
  });

  it('5-burst: Flagship (shape=3) → 5発同時発射', () => {
    const flagship = spawnAt(0, 4, 0, 0); // Flagship (shape=3)
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(flagship).cooldown = 0;
    getUnit(flagship).target = enemy;
    buildHash();
    combat(getUnit(flagship), flagship, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(5);
  });

  it('sniper: Sniper (shape=8) → レールガン + tracerビーム', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (shape=8, rng=600)
    const enemy = spawnAt(1, 1, 300, 0);
    getUnit(sniper).cooldown = 0;
    getUnit(sniper).target = enemy;
    buildHash();
    combat(getUnit(sniper), sniper, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    // tracerビームが追加される
    expect(beams.length).toBeGreaterThan(0);
    // マズルフラッシュパーティクル
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });

  it('dead target → tgt=-1 に設定して return', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    getUnit(enemy).alive = false; // 死亡状態
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(getUnit(fighter).target).toBe(NO_UNIT);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

describe('combat — UNIT STATS', () => {
  it('Cruiser(type 3) に sweep: true がある', () => {
    expect(getUnitType(3).sweep).toBe(true);
  });

  it('Cruiser の fireRate は 1.5', () => {
    expect(getUnitType(3).fireRate).toBe(1.5);
  });

  it('Cruiser の damage は 8', () => {
    expect(getUnitType(3).damage).toBe(8);
  });

  it('Beam Frig(type 12) の fireRate は 0.1', () => {
    expect(getUnitType(12).fireRate).toBe(0.1);
  });

  it('Beam Frig の damage は 0.8', () => {
    expect(getUnitType(12).damage).toBe(0.8);
  });

  it('Beam Frig に sweep がない', () => {
    expect(getUnitType(12).sweep).toBeUndefined();
  });
});

describe('combat — COOLDOWN REGRESSION', () => {
  it('Fighter(type 1) の cooldown は dt 分だけ減少する', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    getUnit(fighter).cooldown = 1.0;
    buildHash();
    combat(getUnit(fighter), fighter, 0.1, 0, rng);
    expect(getUnit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('Beam unit(Cruiser type 3) の cooldown も dt 分だけ減少する（二重デクリメントしない）', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).cooldown = 1.0;
    getUnit(cruiser).target = enemy;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(cruiser).cooldown).toBeCloseTo(0.9);
  });
});

describe('combat — SWEEP BEAM (CD-triggered)', () => {
  it('IDLE: cooldown>0 → スイープ不発、beamOn減衰', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 1.0;
    getUnit(cruiser).beamOn = 0.5;
    getUnit(cruiser).sweepPhase = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(cruiser).sweepPhase).toBe(0);
    expect(getUnit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
    expect(beams.length).toBe(0);
  });

  it('cooldown満了 → スイープ開始 (sweepPhase>0, beamOn=1)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 0;
    getUnit(cruiser).sweepPhase = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.016, 0, rng);
    expect(getUnit(cruiser).sweepPhase).toBeGreaterThan(0);
    expect(getUnit(cruiser).beamOn).toBe(1);
  });

  it('sweepPhase進行: += dt / SWEEP_DURATION(0.8)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.2;
    getUnit(cruiser).sweepBaseAngle = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    // 0.2 + 0.1/0.8 = 0.325
    expect(getUnit(cruiser).sweepPhase).toBeCloseTo(0.325);
  });

  it('スイープ完了 → CDリセット (sweepPhase=0, cooldown=1.5)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.9;
    getUnit(cruiser).sweepBaseAngle = 0;
    buildHash();
    // dt=0.1 → 0.9 + 0.1/0.8 = 1.025 → clamped to 1 → complete
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(cruiser).sweepPhase).toBe(0);
    expect(getUnit(cruiser).cooldown).toBeCloseTo(1.5);
  });

  it('sweep-through命中: arc中心付近の敵にdamage=8', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.4;
    getUnit(cruiser).sweepBaseAngle = 0;
    getUnit(cruiser).angle = 0;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(enemy).hp).toBe(hpBefore - 8);
  });

  it('arc外ミス: 全スイープ実行しても遠方の敵は無傷', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const farEnemy = spawnAt(1, 1, 0, 200); // 90°方向 → arc外
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 0;
    getUnit(cruiser).sweepPhase = 0;
    getUnit(cruiser).angle = 0;
    buildHash();
    const hpBefore = getUnit(farEnemy).hp;
    for (let i = 0; i < 30; i++) {
      combat(getUnit(cruiser), cruiser, 0.016, 0, rng);
    }
    expect(getUnit(farEnemy).hp).toBe(hpBefore);
  });

  it('shielded 60%軽減: 8 * 0.4 = 3.2', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.4;
    getUnit(cruiser).sweepBaseAngle = 0;
    getUnit(cruiser).angle = 0;
    getUnit(enemy).shieldLingerTimer = 1.0;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(enemy).hp).toBeCloseTo(hpBefore - 3.2);
  });

  it('敵kill: hp<=0 → killUnit', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 0, 200, 0); // Drone hp=3
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.4;
    getUnit(cruiser).sweepBaseAngle = 0;
    getUnit(cruiser).angle = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(enemy).alive).toBe(false);
  });

  it('ターゲットロスト → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    getUnit(cruiser).beamOn = 0.5;
    getUnit(cruiser).sweepPhase = 0.3;
    getUnit(cruiser).target = NO_UNIT;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
    expect(getUnit(cruiser).sweepPhase).toBe(0);
    expect(beams.length).toBe(0);
  });

  it('ビーム描画: SWEEPING中のみaddBeam', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).sweepPhase = 0.5;
    getUnit(cruiser).sweepBaseAngle = 0;
    getUnit(cruiser).angle = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('IDLE中はビーム描画なし', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 1.0;
    getUnit(cruiser).beamOn = 0;
    getUnit(cruiser).sweepPhase = 0;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBe(0);
  });

  it('DPS検証: 2-5の範囲', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).cooldown = 0;
    getUnit(cruiser).angle = 0;
    getUnit(enemy).hp = 9999;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    for (let i = 0; i < 300; i++) {
      combat(getUnit(cruiser), cruiser, 0.033, 0, rng);
    }
    const totalDmg = hpBefore - getUnit(enemy).hp;
    const dps = totalDmg / (300 * 0.033);
    expect(dps).toBeGreaterThanOrEqual(2);
    expect(dps).toBeLessThanOrEqual(5);
  });

  it('距離>=range → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > range=350
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 0.5;
    getUnit(cruiser).sweepPhase = 0.3;
    buildHash();
    combat(getUnit(cruiser), cruiser, 0.1, 0, rng);
    expect(getUnit(cruiser).beamOn).toBeCloseTo(0.5 - 0.1 * 3);
    expect(getUnit(cruiser).sweepPhase).toBe(0);
  });
});

describe('combat — FOCUS BEAM', () => {
  it('beamOn が dt×0.8 で蓄積', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 0;
    getUnit(frig).cooldown = 999;
    buildHash();
    combat(getUnit(frig), frig, 0.1, 0, rng);
    expect(getUnit(frig).beamOn).toBeCloseTo(0.08);
  });

  it('beamOn の上限は 2.0', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 1.95;
    getUnit(frig).cooldown = 999;
    buildHash();
    combat(getUnit(frig), frig, 0.1, 0, rng);
    expect(getUnit(frig).beamOn).toBeCloseTo(2.0);
  });

  it('ターゲット死亡で beamOn リセット', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 1.5;
    getUnit(frig).cooldown = 0;
    getUnit(enemy).hp = 0.1;
    buildHash();
    combat(getUnit(frig), frig, 0.016, 0, rng);
    expect(getUnit(frig).beamOn).toBe(0);
  });

  it('ダメージは damage × beamOn × vd', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 1.5;
    getUnit(frig).cooldown = 0;
    getUnit(frig).vet = 0;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(frig), frig, 0.016, 0, rng);
    const expectedDmg = 0.8 * (1.5 + 0.016 * 0.8) * 1.0;
    expect(getUnit(enemy).hp).toBeCloseTo(hpBefore - expectedDmg);
  });

  it('ビーム幅は (2 + beamOn * 2)', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 1.0;
    getUnit(frig).cooldown = 999;
    buildHash();
    combat(getUnit(frig), frig, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
    const expectedBeamOn = 1.0 + 0.016 * 0.8;
    const b = beams[0];
    expect(b).toBeDefined();
    if (b) expect(b.width).toBeCloseTo(2 + expectedBeamOn * 2);
  });

  it('beamOn=0 → ヒットパーティクル1個', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 0;
    getUnit(frig).cooldown = 0;
    getUnit(enemy).hp = 9999;
    buildHash();
    combat(getUnit(frig), frig, 0.016, 0, rng);
    // beamOn=0+dt*0.8≈0.0128 → floor(0.0128*2)=0 → 1+0=1個
    expect(poolCounts.particleCount).toBe(1);
  });

  it('beamOn=2 → ヒットパーティクル5個', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).beamOn = 2;
    getUnit(frig).cooldown = 0;
    getUnit(enemy).hp = 9999;
    buildHash();
    combat(getUnit(frig), frig, 0.016, 0, rng);
    // beamOn=2(clamped) → floor(2*2)=4 → 1+4=5個
    expect(poolCounts.particleCount).toBe(5);
  });

  it('DPS検証: 10秒で Beam Frig DPS ≈ 8-16', () => {
    const frig = spawnAt(0, 12, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(frig).target = enemy;
    getUnit(frig).cooldown = 0;
    getUnit(frig).beamOn = 0;
    getUnit(frig).vet = 0;
    getUnit(enemy).hp = 9999;
    buildHash();
    const hpBefore = getUnit(enemy).hp;
    for (let i = 0; i < 300; i++) {
      combat(getUnit(frig), frig, 0.033, 0, rng);
    }
    const totalDmg = hpBefore - getUnit(enemy).hp;
    const dps = totalDmg / (300 * 0.033);
    expect(dps).toBeGreaterThanOrEqual(6);
    expect(dps).toBeLessThanOrEqual(18);
  });
});

describe('combat — DRONE SWARM', () => {
  it('孤立 Drone: ダメージ倍率 ×1.0', () => {
    const drone = spawnAt(0, 0, 0, 0); // Drone (swarm, dmg=1)
    const enemy = spawnAt(1, 1, 50, 0);
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    // dmg = 1 * 1.0 (vd) * 1.0 (no allies) = 1.0
    expect(getProjectile(0).damage).toBeCloseTo(1.0);
  });

  it('味方 Drone 3体: ダメージ倍率 ×1.45', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 味方 Drone を周囲に 3体配置 (80以内)
    spawnAt(0, 0, 20, 0);
    spawnAt(0, 0, -20, 0);
    spawnAt(0, 0, 0, 20);
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    // dmg = 1 * 1.0 * (1 + 3*0.15) = 1.45
    expect(getProjectile(0).damage).toBeCloseTo(1.45);
  });

  it('味方 6+体: 上限 ×1.9', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    for (let i = 0; i < 8; i++) {
      spawnAt(0, 0, 10 + i * 5, 10);
    }
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    // min(8, 6) * 0.15 = 0.9 → dmg = 1 * 1.9
    expect(getProjectile(0).damage).toBeCloseTo(1.9);
  });

  it('他タイプの味方は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // Fighter (type=1) は同型ではないのでカウントされない
    spawnAt(0, 1, 20, 0);
    spawnAt(0, 1, -20, 0);
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    expect(getProjectile(0).damage).toBeCloseTo(1.0);
  });

  it('敵チームの同型は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 敵チームの Drone
    spawnAt(1, 0, 20, 0);
    spawnAt(1, 0, -20, 0);
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    expect(getProjectile(0).damage).toBeCloseTo(1.0);
  });

  it('孤立 Drone: プロジェクタイル size/color は変化なし', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    const p = getProjectile(0);
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
    getUnit(drone).cooldown = 0;
    getUnit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(getUnit(drone), drone, 0.016, 0, rng);
    const p = getProjectile(0);
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
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).burstCount = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getUnit(fighter).burstCount).toBe(2);
  });

  it('バースト中間: cooldown = BURST_INTERVAL (0.07)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).burstCount = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    // burstCount=2 (>0) → cooldown = 0.07
    expect(getUnit(fighter).cooldown).toBeCloseTo(0.07);
  });

  it('最終弾: cooldown = fireRate (0.9)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).burstCount = 1; // 残り1発
    getUnit(fighter).target = enemy;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    // burstCount=0 → cooldown = fireRate = 0.9
    expect(getUnit(fighter).burstCount).toBe(0);
    expect(getUnit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('ターゲットロスト → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    getUnit(fighter).burstCount = 2;
    getUnit(fighter).target = NO_UNIT;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(getUnit(fighter).burstCount).toBe(0);
  });

  it('ターゲット死亡 → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).burstCount = 2;
    getUnit(fighter).target = enemy;
    getUnit(enemy).alive = false;
    buildHash();
    combat(getUnit(fighter), fighter, 0.016, 0, rng);
    expect(getUnit(fighter).burstCount).toBe(0);
    expect(getUnit(fighter).target).toBe(NO_UNIT);
  });
});
