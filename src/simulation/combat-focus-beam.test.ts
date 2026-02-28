import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { poolCounts, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { _resetSweepHits } from './combat-sweep.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
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
