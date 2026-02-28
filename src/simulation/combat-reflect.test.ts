import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import type { ProjectileIndex } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { killProjectile, spawnProjectile } from './spawn.ts';

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
