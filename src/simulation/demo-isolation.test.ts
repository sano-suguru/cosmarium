import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams, trackingBeams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, SH_CIRCLE } from '../constants.ts';
import { clearAllPools, getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import type { UnitIndex } from '../types.ts';
import { restorePools, snapshotPools } from '../ui/codex.ts';
import { chainLightning, resetPendingChains, snapshotPendingChains, updatePendingChains } from './effects.ts';
import { buildHash } from './spatial-hash.ts';
import { addBeam, spawnParticle, spawnProjectile } from './spawn.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

afterEach(() => {
  resetPools();
  resetState();
});

// ---------------------------------------------------------------------------
// snapshotPools → clearAllPools → restorePools ラウンドトリップ
// ---------------------------------------------------------------------------
describe('snapshot & restore ラウンドトリップ', () => {
  it('ユニットのHP/位置/チームが完全復元される', () => {
    const idx0 = spawnAt(0, 1, 100, 200);
    const idx1 = spawnAt(1, 3, -50, 300);
    const u0Before = { ...getUnit(idx0) };
    const u1Before = { ...getUnit(idx1) };

    const snapshot = snapshotPools();
    clearAllPools();

    // プールは空になっている
    expect(poolCounts.unitCount).toBe(0);
    expect(getUnit(idx0).alive).toBe(false);

    restorePools(snapshot);

    // 復元後、元の状態と一致
    expect(poolCounts.unitCount).toBe(2);
    const u0After = getUnit(idx0);
    expect(u0After.alive).toBe(true);
    expect(u0After.x).toBe(u0Before.x);
    expect(u0After.y).toBe(u0Before.y);
    expect(u0After.hp).toBe(u0Before.hp);
    expect(u0After.team).toBe(u0Before.team);
    expect(u0After.type).toBe(u0Before.type);

    const u1After = getUnit(idx1);
    expect(u1After.alive).toBe(true);
    expect(u1After.x).toBe(u1Before.x);
    expect(u1After.y).toBe(u1Before.y);
    expect(u1After.team).toBe(u1Before.team);
  });

  it('パーティクルが復元される', () => {
    const pi = spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    const pBefore = { ...getParticle(pi) };

    const snapshot = snapshotPools();
    clearAllPools();

    expect(poolCounts.particleCount).toBe(0);

    restorePools(snapshot);

    expect(poolCounts.particleCount).toBe(1);
    const pAfter = getParticle(pi);
    expect(pAfter.alive).toBe(true);
    expect(pAfter.x).toBe(pBefore.x);
    expect(pAfter.y).toBe(pBefore.y);
    expect(pAfter.life).toBe(pBefore.life);
  });

  it('プロジェクタイルが復元される', () => {
    const pi = spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    const pBefore = { ...getProjectile(pi) };

    const snapshot = snapshotPools();
    clearAllPools();

    expect(poolCounts.projectileCount).toBe(0);

    restorePools(snapshot);

    expect(poolCounts.projectileCount).toBe(1);
    const pAfter = getProjectile(pi);
    expect(pAfter.alive).toBe(true);
    expect(pAfter.x).toBe(pBefore.x);
    expect(pAfter.y).toBe(pBefore.y);
    expect(pAfter.damage).toBe(pBefore.damage);
  });

  it('beamsが復元される', () => {
    addBeam(0, 0, 100, 100, 1, 0, 0, 0.5, 2);
    addBeam(20, 20, 30, 30, 0, 1, 0, 1, 3);

    const snapshot = snapshotPools();
    clearAllPools();

    expect(beams).toHaveLength(0);

    restorePools(snapshot);

    expect(beams).toHaveLength(2);
    expect(beams[0]?.x1).toBe(0);
    expect(beams[0]?.x2).toBe(100);
    expect(beams[1]?.x1).toBe(20);
    expect(beams[1]?.x2).toBe(30);
  });

  it('trackingBeamsが復元される', () => {
    trackingBeams.push({
      srcUnit: 0 as UnitIndex,
      tgtUnit: 1 as UnitIndex,
      x1: 0,
      y1: 0,
      x2: 50,
      y2: 50,
      r: 1,
      g: 0,
      b: 0,
      life: 0.5,
      maxLife: 0.5,
      width: 2,
    });

    const snapshot = snapshotPools();
    clearAllPools();

    expect(trackingBeams).toHaveLength(0);

    restorePools(snapshot);

    expect(trackingBeams).toHaveLength(1);
    expect(trackingBeams[0]?.srcUnit).toBe(0);
    expect(trackingBeams[0]?.tgtUnit).toBe(1);
  });

  it('poolCountsが正確に復元される', () => {
    spawnAt(0, 0, 0, 0);
    spawnAt(1, 1, 100, 100);
    spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    spawnProjectile(0, 0, 1, 0, 1, 5, 0, 2, 1, 0, 0);

    const snapshot = snapshotPools();
    clearAllPools();

    expect(poolCounts.unitCount).toBe(0);
    expect(poolCounts.particleCount).toBe(0);
    expect(poolCounts.projectileCount).toBe(0);

    restorePools(snapshot);

    expect(poolCounts.unitCount).toBe(2);
    expect(poolCounts.particleCount).toBe(1);
    expect(poolCounts.projectileCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// clearAllPools
// ---------------------------------------------------------------------------
describe('clearAllPools', () => {
  it('全プールをクリアする', () => {
    spawnAt(0, 0, 100, 100);
    spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    spawnProjectile(0, 0, 1, 0, 1, 5, 0, 2, 1, 0, 0);
    addBeam(0, 0, 10, 10, 1, 0, 0, 1, 2);
    trackingBeams.push({
      srcUnit: 0 as UnitIndex,
      tgtUnit: 1 as UnitIndex,
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      r: 1,
      g: 0,
      b: 0,
      life: 1,
      maxLife: 1,
      width: 1,
    });

    clearAllPools();

    expect(poolCounts.unitCount).toBe(0);
    expect(poolCounts.particleCount).toBe(0);
    expect(poolCounts.projectileCount).toBe(0);
    expect(beams).toHaveLength(0);
    expect(trackingBeams).toHaveLength(0);

    // 全スロットがdead
    let aliveUnits = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive) aliveUnits++;
    }
    expect(aliveUnits).toBe(0);

    let aliveParticles = 0;
    for (let i = 0; i < POOL_PARTICLES; i++) {
      if (getParticle(i).alive) aliveParticles++;
    }
    expect(aliveParticles).toBe(0);

    let aliveProjectiles = 0;
    for (let i = 0; i < POOL_PROJECTILES; i++) {
      if (getProjectile(i).alive) aliveProjectiles++;
    }
    expect(aliveProjectiles).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// snapshotはディープコピー（参照共有しない）
// ---------------------------------------------------------------------------
describe('snapshot の独立性', () => {
  it('snapshot後の変更がsnapshotに影響しない', () => {
    const idx = spawnAt(0, 0, 100, 200);
    const snapshot = snapshotPools();

    // snapshot後にユニットを変更
    getUnit(idx).x = 999;
    getUnit(idx).hp = 0;

    restorePools(snapshot);

    // 元の値に復元される
    expect(getUnit(idx).x).toBe(100);
    expect(getUnit(idx).hp).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 空プールのsnapshot & restore
// ---------------------------------------------------------------------------
describe('空プールのsnapshot & restore', () => {
  it('空プールのsnapshotとrestoreが正常に動作する', () => {
    const snapshot = snapshotPools();

    // デモエンティティを生成
    spawnAt(0, 0, 50, 50);
    spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    expect(poolCounts.unitCount).toBe(1);

    restorePools(snapshot);

    // 空に戻る
    expect(poolCounts.unitCount).toBe(0);
    expect(poolCounts.particleCount).toBe(0);
    expect(poolCounts.projectileCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pendingChains の snapshot & restore
// ---------------------------------------------------------------------------
describe('pendingChains snapshot & restore', () => {
  const rng = () => 0.5;

  afterEach(() => {
    resetPendingChains();
  });

  it('chainLightningで生成されたpendingChainsがsnapshot→clear→restoreで復元される', () => {
    // 複数の敵を配置してチェーンライトニングを発射
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    spawnAt(1, 1, 150, 0);
    buildHash();

    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], rng);

    // ch=0は即時発火、ch>=1がpendingChainsに入る
    const beforeSnapshot = snapshotPendingChains();
    expect(beforeSnapshot.length).toBeGreaterThan(0);

    const snapshot = snapshotPools();

    // クリア
    clearAllPools();
    resetPendingChains();
    expect(snapshotPendingChains()).toHaveLength(0);

    // 復元
    restorePools(snapshot);
    const afterRestore = snapshotPendingChains();
    expect(afterRestore).toEqual(beforeSnapshot);
  });

  it('snapshotは独立コピーであり、元のpendingChainsの変更に影響されない', () => {
    spawnAt(1, 1, 50, 0);
    spawnAt(1, 1, 100, 0);
    buildHash();

    chainLightning(0, 0, 0, 10, 5, [1, 0, 0], rng);
    const snapshot = snapshotPools();

    // pendingChainsを進行させて消費
    updatePendingChains(1.0, rng);
    expect(snapshotPendingChains()).toHaveLength(0);

    // 復元すると元のpendingChainsが復活
    restorePools(snapshot);
    expect(snapshotPendingChains().length).toBeGreaterThan(0);
  });
});
