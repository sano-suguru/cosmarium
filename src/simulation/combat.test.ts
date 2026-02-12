import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts, prP, uP } from '../pools.ts';
import { beams } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { bHash } from './spatial-hash.ts';
import { spPr } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, tz: 1, tx: 0, ty: 0, shkx: 0, shky: 0, shk: 0 },
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
    const u = uP[idx]!;
    u.stun = 1.0;
    u.cd = 0;
    u.tgt = -1;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(u, idx, 0.016, 0);
    // cd はスタン中変化しない
    expect(u.cd).toBe(0);
  });

  it('cd, aCd がdt分減少する', () => {
    const idx = spawnAt(0, 1, 0, 0);
    const u = uP[idx]!;
    u.cd = 1.0;
    u.aCd = 0.5;
    u.tgt = -1;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(u, idx, 0.016, 0);
    expect(u.cd).toBeCloseTo(1.0 - 0.016);
    expect(u.aCd).toBeCloseTo(0.5 - 0.016);
  });
});

describe('combat — RAM', () => {
  it('衝突時に敵にダメージ (mass×3×vd) + 自傷 (敵mass)', () => {
    const ram = spawnAt(0, 9, 0, 0); // Ram (mass=12)
    const enemy = spawnAt(1, 1, 5, 0); // Fighter (mass=2, sz=7)
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ramHpBefore = uP[ram]!.hp;
    const enemyHpBefore = uP[enemy]!.hp;
    combat(uP[ram]!, ram, 0.016, 0);
    // Ram (sz=12) + Fighter (sz=7) = 19, distance = 5 < 19 → 衝突
    // vet=0: vd = 1 + 0*0.2 = 1
    // enemy damage: ceil(12 * 3 * 1) = 36
    expect(uP[enemy]!.hp).toBe(enemyHpBefore - 36);
    // self damage: ceil(Fighter.mass) = ceil(2) = 2
    expect(uP[ram]!.hp).toBe(ramHpBefore - 2);
  });

  it('衝突でノックバック発生', () => {
    const ram = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 1, 5, 0);
    uP[enemy]!.vx = 0;
    uP[enemy]!.vy = 0;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[ram]!, ram, 0.016, 0);
    // ノックバックで敵のvxが変化
    expect(uP[enemy]!.vx).not.toBe(0);
  });

  it('敵HP<=0 → killU + explosion', () => {
    const ram = spawnAt(0, 9, 0, 0);
    const enemy = spawnAt(1, 0, 5, 0); // Drone (hp=3, sz=4)
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[ram]!, ram, 0.016, 0);
    // Ram damage = ceil(12*3*1) = 36 >> 3 → 敵は死亡
    expect(uP[enemy]!.alive).toBe(false);
  });

  it('自身HP<=0 → 自身も死亡', () => {
    const ram = spawnAt(0, 9, 0, 0);
    uP[ram]!.hp = 1; // HP1にする
    spawnAt(1, 4, 5, 0); // Flagship (mass=30)
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[ram]!, ram, 0.016, 0);
    // self damage = ceil(Flagship.mass) = ceil(30) = 30 >> 1
    expect(uP[ram]!.alive).toBe(false);
  });
});

describe('combat — HEALER', () => {
  it('味方HP回復 (hp+3, 上限mhp)', () => {
    const healer = spawnAt(0, 5, 0, 0); // Healer
    const ally = spawnAt(0, 1, 50, 0); // Fighter (hp=10, mhp=10)
    uP[healer]!.aCd = 0; // クールダウン切れ
    uP[ally]!.hp = 5; // ダメージ受けた状態
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[healer]!, healer, 0.016, 0);
    expect(uP[ally]!.hp).toBe(8); // 5 + 3
  });

  it('hp上限 (mhp) を超えない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    uP[healer]!.aCd = 0;
    uP[ally]!.hp = 9; // mhp=10, hp=9 → +3 → clamp to 10
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[healer]!, healer, 0.016, 0);
    expect(uP[ally]!.hp).toBe(10);
  });

  it('aCd=0.35 にリセットされる', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    uP[healer]!.aCd = 0;
    uP[ally]!.hp = 5;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[healer]!, healer, 0.016, 0);
    expect(uP[healer]!.aCd).toBeCloseTo(0.35);
  });

  it('自身は回復しない', () => {
    const healer = spawnAt(0, 5, 0, 0);
    uP[healer]!.aCd = 0;
    uP[healer]!.hp = 5;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[healer]!, healer, 0.016, 0);
    expect(uP[healer]!.hp).toBe(5); // 変化なし
  });

  it('回復ビームが追加される', () => {
    const healer = spawnAt(0, 5, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    uP[healer]!.aCd = 0;
    uP[ally]!.hp = 5;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[healer]!, healer, 0.016, 0);
    expect(beams.length).toBeGreaterThan(0);
  });
});

describe('combat — REFLECTOR', () => {
  it('敵弾の速度を×-1.2反転 + team変更', () => {
    const reflector = spawnAt(0, 6, 0, 0); // Reflector (rng=130)
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    spPr(50, 0, -100, 0, 1, 5, 1, 2, 1, 0, 0); // team=1 の敵弾 (x=50, rng内)
    const p = prP[0]!;
    expect(p.team).toBe(1);
    const vxBefore = p.vx;
    combat(uP[reflector]!, reflector, 0.016, 0);
    // 反射: vx *= -1.2
    expect(p.vx).toBeCloseTo(vxBefore * -1.2);
    expect(p.team).toBe(0); // team変更
  });
});

describe('combat — CARRIER', () => {
  it('sCd<=0 で Drone×4 スポーン', () => {
    const carrier = spawnAt(0, 7, 0, 0); // Carrier
    uP[carrier]!.sCd = 0; // クールダウン切れ
    const ucBefore = poolCounts.uC;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[carrier]!, carrier, 0.016, 0);
    // Drone×4 生成
    expect(poolCounts.uC).toBe(ucBefore + 4);
    // Drone (type=0) が生成されている
    let drones = 0;
    for (let i = 0; i < uP.length; i++) {
      if (uP[i]!.alive && uP[i]!.type === 0 && i !== carrier) drones++;
    }
    expect(drones).toBe(4);
  });

  it('sCd > 0 → スポーンなし', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    uP[carrier]!.sCd = 5.0;
    const ucBefore = poolCounts.uC;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[carrier]!, carrier, 0.016, 0);
    expect(poolCounts.uC).toBe(ucBefore);
  });

  it('sCd リセット', () => {
    const carrier = spawnAt(0, 7, 0, 0);
    uP[carrier]!.sCd = 0;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[carrier]!, carrier, 0.016, 0);
    // sCd = 4 + random * 2 = 4 + 0.5*2 = 5.0
    expect(uP[carrier]!.sCd).toBeCloseTo(5.0);
  });
});

describe('combat — EMP', () => {
  it('範囲内の敵にstun=1.5 + ダメージ', () => {
    const emp = spawnAt(0, 11, 0, 0); // EMP (rng=200, dmg=2)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[emp]!.aCd = 0;
    uP[emp]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[enemy]!.hp;
    combat(uP[emp]!, emp, 0.016, 0);
    expect(uP[enemy]!.stun).toBe(1.5);
    expect(uP[enemy]!.hp).toBe(hpBefore - 2); // dmg=2
  });

  it('tgt<0 → 即return', () => {
    const emp = spawnAt(0, 11, 0, 0);
    uP[emp]!.aCd = 0;
    uP[emp]!.tgt = -1;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[emp]!, emp, 0.016, 0);
    expect(poolCounts.pC).toBe(0); // パーティクルなし = 何も実行されず
  });

  it('味方にスタンはかからない', () => {
    const emp = spawnAt(0, 11, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[emp]!.aCd = 0;
    uP[emp]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[emp]!, emp, 0.016, 0);
    expect(uP[ally]!.stun).toBe(0);
    expect(uP[enemy]!.stun).toBe(1.5);
  });
});

describe('combat — TELEPORTER', () => {
  it('距離80-500でテレポート + 5発射撃', () => {
    const tp = spawnAt(0, 13, 0, 0); // Teleporter
    const enemy = spawnAt(1, 1, 200, 0);
    uP[tp]!.tp = 0; // クールダウン切れ
    uP[tp]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[tp]!, tp, 0.016, 0);
    // テレポート後: tp > 0 にリセット
    expect(uP[tp]!.tp).toBeGreaterThan(0);
    // テレポート射撃5発（combat内ループ）+ NORMAL FIRE フォールスルー1発 = 計6
    expect(poolCounts.prC).toBe(6);
    // パーティクル生成（テレポートエフェクト）
    expect(poolCounts.pC).toBeGreaterThan(0);
  });

  it('tp>0 では何もしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    uP[tp]!.tp = 3.0; // クールダウン中
    uP[tp]!.tgt = enemy;
    uP[tp]!.cd = 999; // NORMAL FIREも防ぐ
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[tp]!, tp, 0.016, 0);
    // tp はdt分減少するだけ
    expect(uP[tp]!.tp).toBeCloseTo(3.0 - 0.016);
    expect(poolCounts.prC).toBe(0);
  });

  it('距離が80未満ではテレポートしない', () => {
    const tp = spawnAt(0, 13, 0, 0);
    const enemy = spawnAt(1, 1, 30, 0); // 距離 30 < 80
    uP[tp]!.tp = 0;
    uP[tp]!.tgt = enemy;
    uP[tp]!.cd = 999;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[tp]!, tp, 0.016, 0);
    // tp -= dt は常に実行されるのでtp = 0 - 0.016
    expect(uP[tp]!.tp).toBeCloseTo(-0.016);
    expect(poolCounts.prC).toBe(0);
  });
});

describe('combat — CHAIN LIGHTNING', () => {
  it('chainLightning() 呼出 + cdリセット', () => {
    const chain = spawnAt(0, 14, 0, 0); // Chain Bolt (rng=250, fr=2)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[chain]!.cd = 0;
    uP[chain]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[chain]!, chain, 0.016, 0);
    // cd = fr = 2
    expect(uP[chain]!.cd).toBeCloseTo(TYPES[14]!.fr);
    // ビーム + ダメージ
    expect(beams.length).toBeGreaterThan(0);
  });

  it('tgt<0 → 即return', () => {
    const chain = spawnAt(0, 14, 0, 0);
    uP[chain]!.cd = 0;
    uP[chain]!.tgt = -1;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[chain]!, chain, 0.016, 0);
    expect(beams.length).toBe(0);
  });
});

describe('combat — BEAM', () => {
  it('beamOn が dt×2 で蓄積（max 1）', () => {
    const cruiser = spawnAt(0, 3, 0, 0); // Cruiser (beam=true, rng=350)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[cruiser]!.tgt = enemy;
    uP[cruiser]!.beamOn = 0;
    uP[cruiser]!.cd = 999; // ダメージ発動をスキップしてbeamOnのみ確認
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[cruiser]!, cruiser, 0.1, 0);
    expect(uP[cruiser]!.beamOn).toBeCloseTo(0.2); // dt*2 = 0.1*2
  });

  it('beamOn の上限は 1', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[cruiser]!.tgt = enemy;
    uP[cruiser]!.beamOn = 0.95;
    uP[cruiser]!.cd = 999;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[cruiser]!, cruiser, 0.1, 0);
    expect(uP[cruiser]!.beamOn).toBe(1); // min(0.95 + 0.2, 1) = 1
  });

  it('shielded時60%軽減', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[cruiser]!.tgt = enemy;
    uP[cruiser]!.beamOn = 1;
    uP[cruiser]!.cd = 0;
    uP[enemy]!.shielded = true;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[enemy]!.hp;
    combat(uP[cruiser]!, cruiser, 0.016, 0);
    // dmg = 3 * 1 * 1 * 0.4 = 1.2 (shielded → 60% reduction)
    expect(uP[enemy]!.hp).toBeCloseTo(hpBefore - 1.2);
  });

  it('shielded なしの場合のフルダメージ', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[cruiser]!.tgt = enemy;
    uP[cruiser]!.beamOn = 1;
    uP[cruiser]!.cd = 0;
    uP[enemy]!.shielded = false;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hpBefore = uP[enemy]!.hp;
    combat(uP[cruiser]!, cruiser, 0.016, 0);
    // dmg = 3 * 1 * 1 = 3 (no shield reduction)
    expect(uP[enemy]!.hp).toBeCloseTo(hpBefore - 3);
  });

  it('addBeam が呼ばれる', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[cruiser]!.tgt = enemy;
    uP[cruiser]!.beamOn = 0.5;
    uP[cruiser]!.cd = 999;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[cruiser]!, cruiser, 0.016, 0);
    expect(beams.length).toBeGreaterThan(0);
  });
});

describe('combat — NORMAL FIRE', () => {
  it('射程内で cd<=0 → プロジェクタイル発射', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170, fr=0.35)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[fighter]!.cd = 0;
    uP[fighter]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[fighter]!, fighter, 0.016, 0);
    expect(poolCounts.prC).toBe(1);
    expect(uP[fighter]!.cd).toBeCloseTo(TYPES[1]!.fr);
  });

  it('射程外 → プロジェクタイルなし', () => {
    const fighter = spawnAt(0, 1, 0, 0); // Fighter (rng=170)
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > rng
    uP[fighter]!.cd = 0;
    uP[fighter]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[fighter]!, fighter, 0.016, 0);
    expect(poolCounts.prC).toBe(0);
  });

  it('vet=1: dmg×1.2', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[fighter]!.cd = 0;
    uP[fighter]!.tgt = enemy;
    uP[fighter]!.vet = 1;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[fighter]!, fighter, 0.016, 0);
    // Fighter dmg=2, vet=1 → 2 * 1.2 = 2.4
    expect(prP[0]!.dmg).toBeCloseTo(2.4);
  });

  it('vet=2: dmg×1.4', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[fighter]!.cd = 0;
    uP[fighter]!.tgt = enemy;
    uP[fighter]!.vet = 2;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[fighter]!, fighter, 0.016, 0);
    // Fighter dmg=2, vet=2 → 2 * 1.4 = 2.8
    expect(prP[0]!.dmg).toBeCloseTo(2.8);
  });

  it('homing: ホーミングプロジェクタイル生成', () => {
    const missile = spawnAt(0, 10, 0, 0); // Missile (homing=true)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[missile]!.cd = 0;
    uP[missile]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[missile]!, missile, 0.016, 0);
    expect(poolCounts.prC).toBe(1);
    expect(prP[0]!.hom).toBe(true);
    expect(prP[0]!.tx).toBe(enemy);
  });

  it('aoe: AOEプロジェクタイル生成', () => {
    const bomber = spawnAt(0, 2, 0, 0); // Bomber (aoe=70)
    const enemy = spawnAt(1, 1, 100, 0);
    uP[bomber]!.cd = 0;
    uP[bomber]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[bomber]!, bomber, 0.016, 0);
    expect(poolCounts.prC).toBe(1);
    expect(prP[0]!.aoe).toBe(70);
  });

  it('5-burst: Flagship (sh=3) → 5発同時発射', () => {
    const flagship = spawnAt(0, 4, 0, 0); // Flagship (sh=3)
    const enemy = spawnAt(1, 1, 200, 0);
    uP[flagship]!.cd = 0;
    uP[flagship]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[flagship]!, flagship, 0.016, 0);
    expect(poolCounts.prC).toBe(5);
  });

  it('sniper: Sniper (sh=8) → レールガン + tracerビーム', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (sh=8, rng=600)
    const enemy = spawnAt(1, 1, 300, 0);
    uP[sniper]!.cd = 0;
    uP[sniper]!.tgt = enemy;
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[sniper]!, sniper, 0.016, 0);
    expect(poolCounts.prC).toBe(1);
    // tracerビームが追加される
    expect(beams.length).toBeGreaterThan(0);
    // マズルフラッシュパーティクル
    expect(poolCounts.pC).toBeGreaterThan(0);
  });

  it('dead target → tgt=-1 に設定して return', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    uP[fighter]!.cd = 0;
    uP[fighter]!.tgt = enemy;
    uP[enemy]!.alive = false; // 死亡状態
    bHash();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    combat(uP[fighter]!, fighter, 0.016, 0);
    expect(uP[fighter]!.tgt).toBe(-1);
    expect(poolCounts.prC).toBe(0);
  });
});
