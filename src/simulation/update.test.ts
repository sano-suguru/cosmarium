import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
// winTeam は export let → ESM live binding で読取可能（setter 不要）
import { asteroids, bases, beams, setCatalogOpen, setGameMode, setReinforcementTimer, winTeam } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, tz: 1, tx: 0, ty: 0, shkx: 0, shky: 0, shk: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/catalog.ts', () => ({
  updateCatDemo: vi.fn(),
  setupCatDemo: vi.fn(),
  buildCatUI: vi.fn(),
  toggleCat: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  showWin: vi.fn(),
  setSpd: vi.fn(),
  startGame: vi.fn(),
  backToMenu: vi.fn(),
  initUI: vi.fn(),
}));

import { addShake } from '../input/camera.ts';
import { updateCatDemo } from '../ui/catalog.ts';
import { showWin } from '../ui/game-control.ts';
import { update } from './update.ts';

afterEach(() => {
  resetPools();
  resetState();
  // vi.mock() ファクトリで作成した vi.fn() の呼び出し履歴は restoreAllMocks ではクリアされないため必要
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ============================================================
// 1. dt clamping
// ============================================================
describe('dt clamping', () => {
  it('rawDt > 0.033 はクランプされる', () => {
    // パーティクルだけ生成（ユニット/プロジェクタイルなし → steer/combat/projectile ループはスキップ）
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, 0);
    expect(poolCounts.particleCount).toBe(1);
    update(0.05, 0); // dt = min(0.05, 0.033) = 0.033
    expect(particlePool[0]!.life).toBeCloseTo(1.0 - 0.033);
  });

  it('rawDt <= 0.033 はそのまま使われる', () => {
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, 0);
    update(0.02, 0); // dt = min(0.02, 0.033) = 0.02
    expect(particlePool[0]!.life).toBeCloseTo(1.0 - 0.02);
  });
});

// ============================================================
// 2. Particle + Beam (Step 5-6) — シンプルなので先にテスト
// ============================================================
describe('パーティクル pass', () => {
  it('移動 + drag 0.97', () => {
    spawnParticle(0, 0, 100, 200, 1.0, 1, 1, 1, 1, 0);
    update(0.016, 0);
    expect(particlePool[0]!.x).toBeCloseTo(100 * 0.016, 1);
    // vx は drag 後: 100 * 0.97 = 97
    expect(particlePool[0]!.vx).toBeCloseTo(97);
    expect(particlePool[0]!.vy).toBeCloseTo(200 * 0.97);
  });

  it('life<=0 で消滅', () => {
    spawnParticle(0, 0, 0, 0, 0.01, 1, 1, 1, 1, 0);
    expect(poolCounts.particleCount).toBe(1);
    update(0.016, 0); // life = 0.01 - 0.016 < 0
    expect(particlePool[0]!.alive).toBe(false);
    expect(poolCounts.particleCount).toBe(0);
  });
});

describe('ビーム pass', () => {
  it('life<=0 で beams から除去', () => {
    addBeam(0, 0, 100, 0, 1, 1, 1, 0.01, 2);
    expect(beams).toHaveLength(1);
    update(0.016, 0); // life = 0.01 - 0.016 < 0
    expect(beams).toHaveLength(0);
  });
});

// ============================================================
// 3. steer + combat + trail (Step 2)
// ============================================================
describe('steer + combat + trail', () => {
  it('shielded が毎フレーム false にリセットされる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(0, 0, 0, 0); // Drone
    unitPool[idx]!.shielded = true;
    unitPool[idx]!.trailTimer = 99; // trail 抑制
    update(0.016, 0);
    expect(unitPool[idx]!.shielded).toBe(false);
  });

  it('steer→combat 順序: tgt 設定と即発射', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = spawnAt(0, 1, 0, 0); // Fighter team 0
    const b = spawnAt(1, 1, 100, 0); // Fighter team 1
    unitPool[a]!.trailTimer = 99;
    unitPool[b]!.trailTimer = 99;
    // cd=0 (spawnAt mock), tgt=-1 (初期値)
    update(0.016, 0);
    // steer が tgt を設定 → combat が即発射
    expect(unitPool[a]!.target).toBeGreaterThanOrEqual(0);
    expect(poolCounts.projectileCount).toBeGreaterThanOrEqual(1);
  });

  it('trail timer: tT<=0 でパーティクル生成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(0, 0, 500, 500); // Drone (遠方で敵なし)
    unitPool[idx]!.trailTimer = 0.001; // すぐ切れる
    update(0.016, 0); // tT = 0.001 - 0.016 < 0 → trail
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. Reflector shield (Step 3)
// ============================================================
describe('Reflector shield', () => {
  it('範囲内の味方が shielded=true になる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ref = spawnAt(0, 6, 0, 0); // Reflector team 0
    const ally = spawnAt(0, 1, 50, 0); // Fighter team 0 (距離50)
    unitPool[ref]!.trailTimer = 99;
    unitPool[ally]!.trailTimer = 99;
    update(0.016, 0);
    expect(unitPool[ally]!.shielded).toBe(true);
  });

  it('範囲外の味方は shielded=false', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ref = spawnAt(0, 6, 0, 0); // Reflector
    const ally = spawnAt(0, 1, 250, 0); // 距離250 → gN(0,0,100) の外
    unitPool[ref]!.trailTimer = 99;
    unitPool[ally]!.trailTimer = 99;
    update(0.016, 0);
    expect(unitPool[ally]!.shielded).toBe(false);
  });

  it('敵チームは shielded=false', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ref = spawnAt(0, 6, 0, 0); // Reflector team 0
    const enemy = spawnAt(1, 0, 50, 0); // Drone team 1 (距離50)
    unitPool[ref]!.trailTimer = 99;
    unitPool[enemy]!.trailTimer = 99;
    update(0.016, 0);
    expect(unitPool[enemy]!.shielded).toBe(false);
  });
});

// ============================================================
// 5. Projectile pass (Step 4)
// ============================================================
describe('projectile pass', () => {
  it('移動: x += vx*dt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    // x = 0 + 300 * 0.016 = 4.8
    expect(projectilePool[0]!.x).toBeCloseTo(4.8);
  });

  it('life<=0 で消滅 (aoe=0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    spawnProjectile(0, 0, 0, 0, 0.01, 5, 0, 2, 1, 0, 0);
    expect(poolCounts.projectileCount).toBe(1);
    update(0.016, 0);
    expect(projectilePool[0]!.alive).toBe(false);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('AOE 爆発: 範囲内の敵にダメージ + addShake(3)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const enemy = spawnAt(1, 1, 30, 0); // Fighter (hp=10)
    unitPool[enemy]!.trailTimer = 99;
    // AOE projectile: life=0.01 (すぐ消滅), aoe=70, dmg=8, team=0
    spawnProjectile(0, 0, 0, 0, 0.01, 8, 0, 2, 1, 0, 0, false, 70);
    update(0.016, 0);
    // 距離30 < aoe=70 → ダメージ: 8 * (1 - 30/(70*1.2)) = 8 * (1 - 0.357) ≈ 5.14
    expect(unitPool[enemy]!.hp).toBeLessThan(10);
    expect(addShake).toHaveBeenCalledWith(3);
  });

  it('ユニットヒット: 通常ダメージ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const enemy = spawnAt(1, 1, 5, 0); // Fighter (sz=7, hp=10)
    unitPool[enemy]!.trailTimer = 99;
    // team=0 の弾、dmg=5、敵の真横
    spawnProjectile(0, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    // 距離5 < sz=7 → ヒット、hp = 10 - 5 = 5
    expect(unitPool[enemy]!.hp).toBe(5);
    expect(projectilePool[0]!.alive).toBe(false);
  });

  it('shielded ヒット: 0.3 倍ダメージ', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Reflector (team=1) を射程外に配置して shield だけ適用、反射は阻止
    const rng = TYPES[6]!.range;
    const reflector = spawnAt(1, 6, 0, rng + 10); // rng 外で反射しない
    const target = spawnAt(1, 1, 0, 0); // Fighter team=1 (hp=10)
    unitPool[reflector]!.trailTimer = 99;
    unitPool[target]!.trailTimer = 99;
    // team=0 の弾を Fighter の隣に配置
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0);
    // Reflector gN(0,rng+10,100) → Fighter shielded
    // dmg = 10 * 0.3 = 3, hp = 10 - 3 = 7
    expect(unitPool[target]!.hp).toBe(7);
  });

  it('ヒットで HP<=0 → ユニット死亡', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const enemy = spawnAt(1, 0, 3, 0); // Drone (sz=4, hp=3) 距離3 < sz=4
    unitPool[enemy]!.trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0); // dmg=100 >> hp=3
    update(0.016, 0);
    expect(unitPool[enemy]!.alive).toBe(false);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('小惑星衝突で弾が消滅', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    asteroids.push({ x: 100, y: 0, radius: 50, angle: 0, angularVelocity: 0 });
    // 弾を小惑星の中心に配置 (距離0 < r=50)
    spawnProjectile(100, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    expect(projectilePool[0]!.alive).toBe(false);
  });

  it('homing: ターゲット生存時に追尾で曲がる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = spawnAt(1, 1, 0, 200); // 上方に配置
    unitPool[target]!.trailTimer = 99;
    // 右向きに飛ぶ homing 弾、ターゲットは上方
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0);
    // vy が正方向に増加（上に曲がる）
    expect(projectilePool[0]!.vy).toBeGreaterThan(0);
  });

  it('homing: ターゲット死亡時は直進', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = spawnAt(1, 1, 0, 200);
    unitPool[target]!.alive = false; // 死亡させる
    poolCounts.unitCount--;
    unitPool[target]!.trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0);
    // 追尾無効 → vy は 0 のまま（水平直進）
    expect(projectilePool[0]!.vy).toBe(0);
  });
});

// ============================================================
// 6. Steps 7-10: !catalogOpen (game mode, win conditions)
// ============================================================
describe('!catalogOpen: 基地・小惑星・増援・勝利判定', () => {
  it('Mode2 基地ダメージ (80px 以内)', () => {
    setGameMode(2);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // team=0 Fighter を bases[1] (x=1800) の近くに配置
    const idx = spawnAt(0, 1, 1795, 0); // 距離5 < 80
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    // dmg = TYPES[1].dmg * dt * 3 = 2 * 0.016 * 3 = 0.096
    expect(bases[1].hp).toBeLessThan(500);
  });

  it('Mode2 基地ダメージ (80px 超は無害)', () => {
    setGameMode(2);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(0, 1, 1700, 0); // 距離100 > 80
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    expect(bases[1].hp).toBe(500);
  });

  it('小惑星が回転する', () => {
    asteroids.push({ x: 500, y: 500, radius: 30, angle: 0, angularVelocity: 2.0 });
    update(0.016, 0);
    // ang = 0 + 2.0 * 0.016 = 0.032
    expect(asteroids[0]!.angle).toBeCloseTo(0.032);
  });

  it('reinforce が呼び出され両チームにユニットが増える', () => {
    setGameMode(0);
    setReinforcementTimer(2.49);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    update(0.016, 0); // rT = 2.49 + 0.016 = 2.506 >= 2.5
    let t0 = 0;
    let t1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unitPool[i]!.alive) {
        if (unitPool[i]!.team === 0) t0++;
        else t1++;
      }
    }
    expect(t0).toBeGreaterThan(0);
    expect(t1).toBeGreaterThan(0);
  });

  it('Mode1 勝利: team0 のみ → team0 勝利', () => {
    setGameMode(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(0, 1, 0, 0);
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    expect(winTeam).toBe(0);
    expect(showWin).toHaveBeenCalled();
  });

  it('Mode1 勝利: team1 のみ → team1 勝利', () => {
    setGameMode(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(1, 1, 0, 0);
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    expect(winTeam).toBe(1);
    expect(showWin).toHaveBeenCalled();
  });

  it('Mode2 勝利: bases[0].hp<=0 → team1 勝利', () => {
    setGameMode(2);
    bases[0].hp = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    update(0.016, 0);
    expect(winTeam).toBe(1);
    expect(showWin).toHaveBeenCalled();
  });

  it('Mode2 勝利: bases[1].hp<=0 → team0 勝利', () => {
    setGameMode(2);
    bases[1].hp = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    update(0.016, 0);
    expect(winTeam).toBe(0);
    expect(showWin).toHaveBeenCalled();
  });

  it('Mode0 (INFINITE): 片方のみでも勝利判定なし', () => {
    setGameMode(0);
    setReinforcementTimer(0);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const idx = spawnAt(0, 1, 0, 0);
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    expect(winTeam).toBe(-1);
    expect(showWin).not.toHaveBeenCalled();
  });
});

// ============================================================
// 7. catalogOpen 分岐
// ============================================================
describe('catalogOpen 分岐', () => {
  it('catalogOpen=true → steps 7-10 スキップ + updateCatDemo 呼出', () => {
    setCatalogOpen(true);
    setGameMode(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // team0 のみ → !catalogOpen なら勝利判定が発動するはず
    const idx = spawnAt(0, 1, 0, 0);
    unitPool[idx]!.trailTimer = 99;
    update(0.016, 0);
    expect(showWin).not.toHaveBeenCalled();
    expect(updateCatDemo).toHaveBeenCalled();
  });

  it('catalogOpen=true → 小惑星衝突なし（弾が存続）', () => {
    setCatalogOpen(true);
    asteroids.push({ x: 100, y: 0, radius: 50, angle: 0, angularVelocity: 0 });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // 弾を小惑星の中心に配置（!catalogOpen なら消滅するケース）
    spawnProjectile(100, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    // catalogOpen=true → 小惑星衝突チェックがスキップされる
    expect(projectilePool[0]!.alive).toBe(true);
  });
});
