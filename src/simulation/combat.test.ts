import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getProjectile, getUnit, poolCounts } from '../pools.ts';
import { beams } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { spawnProjectile } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat } from './combat.ts';

afterEach(() => {
  resetPools();
  resetState();
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(u, idx, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(u, idx, 0.016, 0);
    expect(u.cooldown).toBeCloseTo(1.0 - 0.016);
    expect(u.abilityCooldown).toBeCloseTo(0.5 - 0.016);
  });
});

describe('combat — RAM', () => {
  it('衝突時に敵にダメージ (mass×3×vd) + 自傷 (敵mass)', () => {
    const ram = spawnAt(0, 9, 0, 0); // Ram (mass=12)
    const enemy = spawnAt(1, 1, 5, 0); // Fighter (mass=2, size=7)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ramHpBefore = getUnit(ram).hp;
    const enemyHpBefore = getUnit(enemy).hp;
    combat(getUnit(ram), ram, 0.016, 0);
    // Ram (size=12) + Fighter (size=7) = 19, distance = 5 < 19 → 衝突
    // vet=0: vd = 1 + 0*0.2 = 1
    // enemy damage: ceil(12 * 3 * 1) = 36
    expect(getUnit(enemy).hp).toBe(enemyHpBefore - 36);
    // self damage: ceil(Fighter.mass) = ceil(2) = 2
    expect(getUnit(ram).hp).toBe(ramHpBefore - 2);
  });

  it('衝突でノックバック発生', () => {
    const ram = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 1, 5, 0);
    getUnit(enemy).vx = 0;
    getUnit(enemy).vy = 0;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(ram), ram, 0.016, 0);
    // ノックバックで敵のvxが変化
    expect(getUnit(enemy).vx).not.toBe(0);
  });

  it('敵HP<=0 → killUnit + explosion', () => {
    const ram = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3, size=4)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(ram), ram, 0.016, 0);
    // Ram damage = ceil(12*3*1) = 36 >> 3 → 敵は死亡
    expect(getUnit(enemy).alive).toBe(false);
  });

  it('自身HP<=0 → 自身も死亡', () => {
    const ram = spawnAt(0, 9, 0, 0);
    getUnit(ram).hp = 1; // HP1にする
    spawnAt(1, 4, 5, 0); // Flagship (mass=30)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(ram), ram, 0.016, 0);
    // self damage = ceil(Flagship.mass) = ceil(30) = 30 >> 1
    expect(getUnit(ram).alive).toBe(false);
  });
});

describe('combat — HEALER', () => {
  it('味方HP回復 (hp+3, 上限maxHp)', () => {
    const healer = spawnAt(0, 5, 0, 0); // Healer
    const ally = spawnAt(0, 1, 50, 0); // Fighter (hp=10, maxHp=10)
    getUnit(healer).abilityCooldown = 0; // クールダウン切れ
    getUnit(ally).hp = 5; // ダメージ受けた状態
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(healer), healer, 0.016, 0);
    expect(getUnit(ally).hp).toBe(8); // 5 + 3
  });

  it('hp上限 (maxHp) を超えない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 9; // maxHp=10, hp=9 → +3 → clamp to 10
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(healer), healer, 0.016, 0);
    expect(getUnit(ally).hp).toBe(10);
  });

  it('abilityCooldown=0.35 にリセットされる', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 5;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(healer), healer, 0.016, 0);
    expect(getUnit(healer).abilityCooldown).toBeCloseTo(0.35);
  });

  it('自身は回復しない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(healer).hp = 5;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(healer), healer, 0.016, 0);
    expect(getUnit(healer).hp).toBe(5); // 変化なし
  });

  it('回復ビームが追加される', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(healer).abilityCooldown = 0;
    getUnit(ally).hp = 5;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(healer), healer, 0.016, 0);
    expect(beams.length).toBeGreaterThan(0);
  });
});

describe('combat — REFLECTOR', () => {
  it('敵弾の速度を×-1.2反転 + team変更', () => {
    const reflector = spawnAt(0, 6, 0, 0); // Reflector (rng=130)
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    spawnProjectile(50, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0); // team=1 の敵弾 (x=50, rng内)
    const p = getProjectile(0);
    expect(p.team).toBe(1);
    const vxBefore = p.vx;
    combat(getUnit(reflector), reflector, 0.016, 0);
    // 反射: vx *= -1.2
    expect(p.vx).toBeCloseTo(vxBefore * -1.2);
    expect(p.team).toBe(0); // team変更
  });
});

describe('combat — CARRIER', () => {
  it('spawnCooldown<=0 で Drone×4 スポーン', () => {
    const carrier = spawnAt(0, 7, 0, 0); // Carrier
    getUnit(carrier).spawnCooldown = 0; // クールダウン切れ
    const ucBefore = poolCounts.unitCount;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(carrier), carrier, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(carrier), carrier, 0.016, 0);
    expect(poolCounts.unitCount).toBe(ucBefore);
  });

  it('spawnCooldown リセット', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    getUnit(carrier).spawnCooldown = 0;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(carrier), carrier, 0.016, 0);
    // spawnCooldown = 4 + random * 2 = 4 + 0.5*2 = 5.0
    expect(getUnit(carrier).spawnCooldown).toBeCloseTo(5.0);
  });
});

describe('combat — EMP', () => {
  it('範囲内の敵にstun=1.5 + ダメージ', () => {
    const emp = spawnAt(0, 11, 0, 0); // EMP (rng=200, damage=2)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(emp).abilityCooldown = 0;
    getUnit(emp).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(emp), emp, 0.016, 0);
    expect(getUnit(enemy).stun).toBe(1.5);
    expect(getUnit(enemy).hp).toBe(hpBefore - 2); // damage=2
  });

  it('tgt<0 → 即return', () => {
    const emp = spawnAt(0, 11, 0, 0);
    getUnit(emp).abilityCooldown = 0;
    getUnit(emp).target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(emp), emp, 0.016, 0);
    expect(poolCounts.particleCount).toBe(0); // パーティクルなし = 何も実行されず
  });

  it('味方にスタンはかからない', () => {
    const emp = spawnAt(0, 11, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(emp).abilityCooldown = 0;
    getUnit(emp).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(emp), emp, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(tp), tp, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(tp), tp, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(tp), tp, 0.016, 0);
    // tp -= dt は常に実行されるのでtp = 0 - 0.016
    expect(getUnit(tp).teleportTimer).toBeCloseTo(-0.016);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

describe('combat — CHAIN LIGHTNING', () => {
  it('chainLightning() 呼出 + cooldownリセット', () => {
    const chain = spawnAt(0, 14, 0, 0); // Chain Bolt (rng=250, fireRate=2)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(chain).cooldown = 0;
    getUnit(chain).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(chain), chain, 0.016, 0);
    // cooldown = fireRate = 2
    expect(getUnit(chain).cooldown).toBeCloseTo(getUnitType(14).fireRate);
    // ビーム + ダメージ
    expect(beams.length).toBeGreaterThan(0);
  });

  it('tgt<0 → 即return', () => {
    const chain = spawnAt(0, 14, 0, 0);
    getUnit(chain).cooldown = 0;
    getUnit(chain).target = NO_UNIT;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(chain), chain, 0.016, 0);
    expect(beams.length).toBe(0);
  });
});

describe('combat — BEAM', () => {
  it('beamOn が dt×2 で蓄積（max 1）', () => {
    const cruiser = spawnAt(0, 3, 0, 0); // Cruiser (beam=true, rng=350)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 0;
    getUnit(cruiser).cooldown = 999; // ダメージ発動をスキップしてbeamOnのみ確認
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(cruiser), cruiser, 0.1, 0);
    expect(getUnit(cruiser).beamOn).toBeCloseTo(0.2); // dt*2 = 0.1*2
  });

  it('beamOn の上限は 1', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 0.95;
    getUnit(cruiser).cooldown = 999;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(cruiser), cruiser, 0.1, 0);
    expect(getUnit(cruiser).beamOn).toBe(1); // min(0.95 + 0.2, 1) = 1
  });

  it('shielded時60%軽減', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).cooldown = 0;
    getUnit(enemy).shielded = true;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(cruiser), cruiser, 0.016, 0);
    // damage = 3 * 1 * 1 * 0.4 = 1.2 (shielded → 60% reduction)
    expect(getUnit(enemy).hp).toBeCloseTo(hpBefore - 1.2);
  });

  it('shielded なしの場合のフルダメージ', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 1;
    getUnit(cruiser).cooldown = 0;
    getUnit(enemy).shielded = false;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = getUnit(enemy).hp;
    combat(getUnit(cruiser), cruiser, 0.016, 0);
    // damage = 3 * 1 * 1 = 3 (no shield reduction)
    expect(getUnit(enemy).hp).toBeCloseTo(hpBefore - 3);
  });

  it('addBeam が呼ばれる', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(cruiser).target = enemy;
    getUnit(cruiser).beamOn = 0.5;
    getUnit(cruiser).cooldown = 999;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(cruiser), cruiser, 0.016, 0);
    expect(beams.length).toBeGreaterThan(0);
  });
});

describe('combat — NORMAL FIRE', () => {
  it('射程内で cooldown<=0 → プロジェクタイル発射', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170, fireRate=0.35)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(fighter), fighter, 0.016, 0);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getUnit(fighter).cooldown).toBeCloseTo(getUnitType(1).fireRate);
  });

  it('射程外 → プロジェクタイルなし', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170)
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > rng
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(fighter), fighter, 0.016, 0);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('vet=1: damage×1.2', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(fighter).cooldown = 0;
    getUnit(fighter).target = enemy;
    getUnit(fighter).vet = 1;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(fighter), fighter, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(fighter), fighter, 0.016, 0);
    // Fighter damage=2, vet=2 → 2 * 1.4 = 2.8
    expect(getProjectile(0).damage).toBeCloseTo(2.8);
  });

  it('homing: ホーミングプロジェクタイル生成', () => {
    const missile = spawnAt(0, 10, 0, 0); // Missile (homing=true)
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(missile).cooldown = 0;
    getUnit(missile).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(missile), missile, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(bomber), bomber, 0.016, 0);
    expect(poolCounts.projectileCount).toBe(1);
    expect(getProjectile(0).aoe).toBe(70);
  });

  it('5-burst: Flagship (shape=3) → 5発同時発射', () => {
    const flagship = spawnAt(0, 4, 0, 0); // Flagship (shape=3)
    const enemy = spawnAt(1, 1, 200, 0);
    getUnit(flagship).cooldown = 0;
    getUnit(flagship).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(flagship), flagship, 0.016, 0);
    expect(poolCounts.projectileCount).toBe(5);
  });

  it('sniper: Sniper (shape=8) → レールガン + tracerビーム', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (shape=8, rng=600)
    const enemy = spawnAt(1, 1, 300, 0);
    getUnit(sniper).cooldown = 0;
    getUnit(sniper).target = enemy;
    buildHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(sniper), sniper, 0.016, 0);
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
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(getUnit(fighter), fighter, 0.016, 0);
    expect(getUnit(fighter).target).toBe(NO_UNIT);
    expect(poolCounts.projectileCount).toBe(0);
  });
});
