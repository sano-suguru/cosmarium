import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGameLoopState, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams, trackingBeams } from '../beams.ts';
import { POOL_UNITS, REF_FPS, SH_CIRCLE, SHIELD_LINGER } from '../constants.ts';
import { decUnits, particle, poolCounts, projectile, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import { unitType } from '../unit-types.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

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
  return {
    ...actual,
    buildHash: vi.fn(actual.buildHash),
  };
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
  it('rawDt <= 1/REF_FPS (0.0333...): buildHash は1回だけ呼ばれる', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.02, 0, rng, gameLoopState());
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(1);
  });

  it('rawDt > 1/REF_FPS: 適切な回数サブステップが実行される (rawDt=0.066 → 2ステップ)', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.066, 0, rng, gameLoopState());
    // maxStep = 1/30 ≈ 0.0333, steps = ceil(0.066/0.0333) = 2
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(2);
  });

  it('rawDt > 1/REF_FPS: 3ステップ以上の分割 (rawDt=0.12 → 4ステップ)', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    update(0.12, 0, rng, gameLoopState());
    // maxStep ≈ 0.0333, steps = ceil(0.12/0.0333) = 4
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(4);
  });

  it('MAX_STEPS_PER_FRAME (8) を超える rawDt: ステップ数がキャップされる', () => {
    spawnAt(0, 0, 0, 0);
    vi.mocked(buildHash).mockClear();
    const maxStep = 1 / REF_FPS;
    const excessiveDt = maxStep * 15; // 15ステップ分の dt
    update(excessiveDt, 0, rng, gameLoopState());
    // min(ceil(15), 8) = 8
    expect(vi.mocked(buildHash)).toHaveBeenCalledTimes(8);
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
// 4. Reflector shield (Step 3)
// ============================================================
describe('Reflector shield', () => {
  it('範囲内の味方が shieldLingerTimer=REFLECTOR_SHIELD_LINGER になる', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBe(SHIELD_LINGER);
  });

  it('範囲外の味方は shieldLingerTimer=0', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 250, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBe(0);
  });

  it('敵チームは shieldLingerTimer=0', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 0, 50, 0);
    unit(ref).trailTimer = 99;
    unit(enemy).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).shieldLingerTimer).toBe(0);
  });

  it('codexOpen=true → Reflector は通常通り shieldLingerTimer を付与する（snapshot/restore方式）', () => {
    state.codexOpen = true;
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBe(SHIELD_LINGER);
  });

  it('範囲内の味方にシールドテザービームが生成される', () => {
    const ref = spawnAt(0, 6, 0, 0);
    spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(0).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBeGreaterThan(0);
  });

  it('範囲外の味方にはシールドテザービームが生成されない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    spawnAt(0, 1, 250, 0);
    unit(ref).trailTimer = 99;
    unit(0).trailTimer = 99;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBe(0);
  });

  it('シールド持続中に範囲内にいてもテザービームは再発射されない', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    unit(ally).shieldLingerTimer = 1.0;
    trackingBeams.length = 0;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBe(0);
  });

  it('テザービームがユニットの移動に追従する', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    expect(trackingBeams.length).toBeGreaterThan(0);
    update(0.016, 0, rng, gameLoopState());
    const tb = trackingBeams[0];
    expect(tb).toBeDefined();
    if (tb === undefined) return;
    expect(tb.x1).toBe(unit(ref).x);
    expect(tb.y1).toBe(unit(ref).y);
    expect(tb.x2).toBe(unit(ally).x);
    expect(tb.y2).toBe(unit(ally).y);
  });

  it('Reflector範囲から出てもシールドは持続する', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    unit(ref).trailTimer = 99;
    unit(ally).trailTimer = 99;
    update(0.016, 0, rng, gameLoopState());
    unit(ally).x = 500;
    update(0.016, 0, rng, gameLoopState());
    expect(unit(ally).shieldLingerTimer).toBeGreaterThan(0);
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
    expect(addShake).toHaveBeenCalledWith(3);
  });

  it('ユニットヒット: 通常ダメージ', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBe(5);
    expect(projectile(0).alive).toBe(false);
  });

  it('shielded ヒット: 0.3 倍ダメージ', () => {
    const reflectorRange = unitType(6).range;
    const reflector = spawnAt(1, 6, 0, reflectorRange + 10);
    const target = spawnAt(1, 1, 0, 0);
    unit(reflector).trailTimer = 99;
    unit(target).trailTimer = 99;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(unit(target).hp).toBe(7);
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
// 5b. 貫通プロジェクタイル + キルCD短縮
// ============================================================
describe('piercing projectile', () => {
  it('貫通弾は最初のヒット後も alive', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    // piercing=0.6, sourceUnit=undefined
    spawnProjectile(0, 0, 300, 0, 1.0, 10, 0, 2, 1, 0, 0, false, 0, undefined, 0.6);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).alive).toBe(true);
  });

  it('貫通後にダメージが piercing 倍に減衰', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 10, 0, 2, 1, 0, 0, false, 0, undefined, 0.6);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).damage).toBeCloseTo(6); // 10 * 0.6
  });

  it('lastHitUnit と同じ敵には再ヒットしない', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    unit(enemy).hp = 100; // 死なないように
    spawnProjectile(0, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0, false, 0, undefined, 0.6);
    // 1フレーム目: ヒット
    update(0.016, 0, rng, gameLoopState());
    const hpAfterFirst = unit(enemy).hp;
    expect(hpAfterFirst).toBe(95); // 100 - 5
    // 弾が動かない(vx=0) → 2フレーム目: 同じ敵の近傍にいるが lastHitUnit でスキップ
    update(0.016, 0, rng, gameLoopState());
    expect(unit(enemy).hp).toBe(95); // 再ヒットしない
  });

  it('非貫通弾（piercing=0）は最初のヒットで消滅（従来通り）', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    unit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0, rng, gameLoopState());
    expect(projectile(0).alive).toBe(false);
  });
});

describe('キル時クールダウン短縮', () => {
  it('sourceUnit 指定時: キルで vet が上昇', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper
    unit(sniper).trailTimer = 99;
    const enemy = spawnAt(1, 0, 3, 0); // Drone hp=3
    unit(enemy).trailTimer = 99;
    // sourceUnit=sniper の弾を生成
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0, false, 0, undefined, 0, sniper);
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
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0, false, 0, undefined, 0, sniper);
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
