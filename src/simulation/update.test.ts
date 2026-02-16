import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { decUnitCount, getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { beams, state } from '../state.ts';
import { getUnitType } from '../unit-types.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/codex.ts', () => ({
  updateCodexDemo: vi.fn(),
  setupCodexDemo: vi.fn(),
  buildCodexUI: vi.fn(),
  toggleCodex: vi.fn(),
  isCodexDemoUnit: vi.fn().mockReturnValue(false),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  startGame: vi.fn(),
  initUI: vi.fn(),
}));

import { addShake } from '../input/camera.ts';
import { isCodexDemoUnit, updateCodexDemo } from '../ui/codex.ts';
import { update } from './update.ts';

afterEach(() => {
  resetPools();
  resetState();
  // restoreAllMocks はモジュールトップレベルの vi.mock() には効かないため、
  // isCodexDemoUnit のデフォルト戻り値を明示リセットする
  vi.mocked(isCodexDemoUnit).mockReturnValue(false);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ============================================================
// 1. dt sub-stepping
// ============================================================
describe('dt sub-stepping', () => {
  it('rawDt > 0.033 はサブステップに分割される', () => {
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, 0);
    expect(poolCounts.particleCount).toBe(1);
    update(0.05, 0);
    // rawDt=0.05, maxStep=0.033, steps=ceil(0.05/0.033)=2, dt=0.05/2=0.025
    // life = 1.0 - 0.025*2 = 0.95
    expect(getParticle(0).life).toBeCloseTo(1.0 - 0.05);
  });

  it('rawDt <= 0.033 はそのまま使われる', () => {
    spawnParticle(0, 0, 0, 0, 1.0, 1, 1, 1, 1, 0);
    update(0.02, 0);
    expect(getParticle(0).life).toBeCloseTo(1.0 - 0.02);
  });
});

// ============================================================
// 2. Particle + Beam (Step 5-6) — シンプルなので先にテスト
// ============================================================
describe('パーティクル pass', () => {
  it('移動 + drag 0.97', () => {
    spawnParticle(0, 0, 100, 200, 1.0, 1, 1, 1, 1, 0);
    update(0.016, 0);
    expect(getParticle(0).x).toBeCloseTo(100 * 0.016, 1);
    expect(getParticle(0).vx).toBeCloseTo(100 * 0.97 ** (0.016 * 30));
    expect(getParticle(0).vy).toBeCloseTo(200 * 0.97 ** (0.016 * 30));
  });

  it('life<=0 で消滅', () => {
    spawnParticle(0, 0, 0, 0, 0.01, 1, 1, 1, 1, 0);
    expect(poolCounts.particleCount).toBe(1);
    update(0.016, 0);
    expect(getParticle(0).alive).toBe(false);
    expect(poolCounts.particleCount).toBe(0);
  });
});

describe('ビーム pass', () => {
  it('life<=0 で beams から除去', () => {
    addBeam(0, 0, 100, 0, 1, 1, 1, 0.01, 2);
    expect(beams).toHaveLength(1);
    update(0.016, 0);
    expect(beams).toHaveLength(0);
  });
});

// ============================================================
// 3. steer + combat + trail (Step 2)
// ============================================================
describe('steer + combat + trail', () => {
  it('shielded が毎フレーム false にリセットされる', () => {
    const idx = spawnAt(0, 0, 0, 0); // Drone
    getUnit(idx).shielded = true;
    getUnit(idx).trailTimer = 99; // trail 抑制
    update(0.016, 0);
    expect(getUnit(idx).shielded).toBe(false);
  });

  it('steer→combat 順序: tgt 設定と即発射', () => {
    const a = spawnAt(0, 1, 0, 0);
    const b = spawnAt(1, 1, 100, 0);
    getUnit(a).trailTimer = 99;
    getUnit(b).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).target).toBeGreaterThanOrEqual(0);
    expect(poolCounts.projectileCount).toBeGreaterThanOrEqual(1);
  });

  it('trail timer: trailTimer<=0 でパーティクル生成', () => {
    const idx = spawnAt(0, 0, 500, 500);
    getUnit(idx).trailTimer = 0.001;
    update(0.016, 0);
    expect(poolCounts.particleCount).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. Reflector shield (Step 3)
// ============================================================
describe('Reflector shield', () => {
  it('範囲内の味方が shielded=true になる', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(ref).trailTimer = 99;
    getUnit(ally).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(ally).shielded).toBe(true);
  });

  it('範囲外の味方は shielded=false', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 250, 0);
    getUnit(ref).trailTimer = 99;
    getUnit(ally).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(ally).shielded).toBe(false);
  });

  it('敵チームは shielded=false', () => {
    const ref = spawnAt(0, 6, 0, 0);
    const enemy = spawnAt(1, 0, 50, 0);
    getUnit(ref).trailTimer = 99;
    getUnit(enemy).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(enemy).shielded).toBe(false);
  });

  it('codexOpen=true → 非デモ Reflector は shielded を付与しない', () => {
    state.codexOpen = true;
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(ref).trailTimer = 99;
    getUnit(ally).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(ally).shielded).toBe(false);
  });

  it('codexOpen=true → デモ Reflector は shielded を付与する', () => {
    state.codexOpen = true;
    vi.mocked(isCodexDemoUnit).mockReturnValue(true);
    const ref = spawnAt(0, 6, 0, 0);
    const ally = spawnAt(0, 1, 50, 0);
    getUnit(ref).trailTimer = 99;
    getUnit(ally).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(ally).shielded).toBe(true);
  });
});

// ============================================================
// 5. Projectile pass (Step 4)
// ============================================================
describe('projectile pass', () => {
  it('移動: x += vx*dt', () => {
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    expect(getProjectile(0).x).toBeCloseTo(4.8);
  });

  it('life<=0 で消滅 (aoe=0)', () => {
    spawnProjectile(0, 0, 0, 0, 0.01, 5, 0, 2, 1, 0, 0);
    expect(poolCounts.projectileCount).toBe(1);
    update(0.016, 0);
    expect(getProjectile(0).alive).toBe(false);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('AOE 爆発: 範囲内の敵にダメージ + addShake(3)', () => {
    const enemy = spawnAt(1, 1, 30, 0);
    getUnit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 0.01, 8, 0, 2, 1, 0, 0, false, 70);
    update(0.016, 0);
    expect(getUnit(enemy).hp).toBeLessThan(10);
    expect(addShake).toHaveBeenCalledWith(3);
  });

  it('ユニットヒット: 通常ダメージ', () => {
    const enemy = spawnAt(1, 1, 5, 0);
    getUnit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 5, 0, 2, 1, 0, 0);
    update(0.016, 0);
    expect(getUnit(enemy).hp).toBe(5);
    expect(getProjectile(0).alive).toBe(false);
  });

  it('shielded ヒット: 0.3 倍ダメージ', () => {
    const rng = getUnitType(6).range;
    const reflector = spawnAt(1, 6, 0, rng + 10);
    const target = spawnAt(1, 1, 0, 0);
    getUnit(reflector).trailTimer = 99;
    getUnit(target).trailTimer = 99;
    spawnProjectile(5, 0, 0, 0, 1.0, 10, 0, 2, 1, 0, 0);
    update(0.016, 0);
    expect(getUnit(target).hp).toBe(7);
  });

  it('ヒットで HP<=0 → ユニット死亡', () => {
    const enemy = spawnAt(1, 0, 3, 0);
    getUnit(enemy).trailTimer = 99;
    spawnProjectile(0, 0, 0, 0, 1.0, 100, 0, 2, 1, 0, 0);
    update(0.016, 0);
    expect(getUnit(enemy).alive).toBe(false);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('homing: ターゲット生存時に追尾で曲がる', () => {
    const target = spawnAt(1, 1, 0, 200);
    getUnit(target).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0);
    expect(getProjectile(0).vy).toBeGreaterThan(0);
  });

  it('homing: ターゲット死亡時は直進', () => {
    const target = spawnAt(1, 1, 0, 200);
    getUnit(target).alive = false;
    decUnitCount();
    getUnit(target).trailTimer = 99;
    spawnProjectile(0, 0, 300, 0, 1.0, 5, 0, 2, 1, 0, 0, true, 0, target);
    update(0.016, 0);
    expect(getProjectile(0).vy).toBe(0);
  });
});

// ============================================================
// 6. reinforce
// ============================================================
describe('reinforce', () => {
  it('reinforce が呼び出され両チームにユニットが増える', () => {
    state.reinforcementTimer = 2.49;
    update(0.016, 0);
    let t0 = 0;
    let t1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive) {
        if (getUnit(i).team === 0) t0++;
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
    getUnit(idx).trailTimer = 99;
    update(0.016, 0);
    expect(updateCodexDemo).toHaveBeenCalled();
  });

  it('codexOpen=true → 非デモユニットの steer/combat スキップ', () => {
    state.codexOpen = true;
    const idx = spawnAt(0, 1, 0, 0);
    const u = getUnit(idx);
    u.trailTimer = 99;
    u.cooldown = 0;
    const origX = u.x;
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(enemy).trailTimer = 99;
    update(0.016, 0);
    expect(u.x).toBe(origX);
    expect(poolCounts.projectileCount).toBe(0);
  });

  it('codexOpen=true → デモユニットは steer/combat が走る', () => {
    state.codexOpen = true;
    vi.mocked(isCodexDemoUnit).mockReturnValue(true);
    const idx = spawnAt(0, 1, 0, 0);
    getUnit(idx).trailTimer = 99;
    getUnit(idx).cooldown = 0;
    const enemy = spawnAt(1, 1, 100, 0);
    getUnit(enemy).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(idx).target).toBeGreaterThanOrEqual(0);
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
    getUnit(a).trailTimer = 99;
    getUnit(b).trailTimer = 99;
    getUnit(c).trailTimer = 99;
    getUnit(d).trailTimer = 99;
    update(0.016, 0);
    // a の近傍に b,c,d → swarmN=3
    expect(getUnit(a).swarmN).toBe(3);
  });

  it('異なる type は swarmN にカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0); // Drone
    const b = spawnAt(0, 1, 20, 0); // Fighter (type !== 0)
    getUnit(a).trailTimer = 99;
    getUnit(b).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(0);
  });

  it('非 swarm ユニットは swarmN=0', () => {
    const a = spawnAt(0, 1, 0, 0); // Fighter (swarm:false)
    const b = spawnAt(0, 1, 20, 0);
    getUnit(a).trailTimer = 99;
    getUnit(b).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(0);
  });

  it('敵チームの同型は swarmN にカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0);
    spawnAt(1, 0, 20, 0);
    spawnAt(1, 0, 0, 20);
    getUnit(a).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(0);
  });

  it('7体以上でも swarmN は 6 にクランプされる', () => {
    const a = spawnAt(0, 0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const idx = spawnAt(0, 0, 10 + i * 5, 10);
      getUnit(idx).trailTimer = 99;
    }
    getUnit(a).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(6);
  });

  it('半径80外の味方はカウントされない', () => {
    const a = spawnAt(0, 0, 0, 0);
    // CELL_SIZE=100, cr=ceil(80/100)=1 → 3x3セル走査。確実にセル外にするため距離201を使用
    const far = spawnAt(0, 0, 201, 0);
    getUnit(a).trailTimer = 99;
    getUnit(far).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(0);
  });

  it('codexOpen=true → 非デモユニットの swarmN は更新されない', () => {
    state.codexOpen = true;
    const a = spawnAt(0, 0, 0, 0);
    const b = spawnAt(0, 0, 20, 0);
    getUnit(a).trailTimer = 99;
    getUnit(b).trailTimer = 99;
    update(0.016, 0);
    expect(getUnit(a).swarmN).toBe(0);
  });
});
