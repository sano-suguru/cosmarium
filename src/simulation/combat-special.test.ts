import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_UNITS } from '../constants.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { HEALER_AMOUNT, HEALER_COOLDOWN } from './combat-special.ts';
import { _resetSweepHits } from './combat-sweep.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
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
    unit(enemy).kbVx = 0;
    unit(enemy).kbVy = 0;
    buildHash();
    combat(unit(lancer), lancer, 0.016, 0, rng);
    // ノックバックで敵のkbVxが変化
    expect(unit(enemy).kbVx).not.toBe(0);
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
    unit(nearby).kbVx = 0;
    unit(nearby).kbVy = 0;
    unit(nearby).stun = 0;
    // hashを再構築して到着
    buildHash();
    unit(tp).teleportTimer = 0;
    combat(unit(tp), tp, 0.016, 0, rng);
    expect(unit(nearby).stun).toBeGreaterThanOrEqual(0.25);
    expect(unit(nearby).kbVx).not.toBe(0);
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
