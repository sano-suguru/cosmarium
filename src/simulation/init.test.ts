import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { rng } from '../state.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { INIT_SPAWNS, initUnits } from './init.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('initUnits', () => {
  it('全ユニットの alive を false にリセットしてから再生成する', () => {
    getUnit(0).alive = true;
    getUnit(1).alive = true;
    initUnits(rng);
    expect(poolCounts.unitCount).toBeGreaterThan(0);
  });

  it('全パーティクルの alive を false にリセットする', () => {
    getParticle(0).alive = true;
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PARTICLES; i++) {
      if (getParticle(i).alive) aliveCount++;
    }
    expect(aliveCount).toBe(0);
  });

  it('全プロジェクタイルの alive を false にリセットする', () => {
    getProjectile(0).alive = true;
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PROJECTILES; i++) {
      if (getProjectile(i).alive) aliveCount++;
    }
    expect(aliveCount).toBe(0);
  });

  it('beams を空にする', () => {
    beams.push({ x1: 0, y1: 0, x2: 1, y2: 1, r: 1, g: 0, b: 0, life: 1, maxLife: 1, width: 1 });
    initUnits(rng);
    expect(beams).toHaveLength(0);
  });

  it('両チーム合計 n合計 × 2チーム ユニットを生成する', () => {
    initUnits(rng);
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(poolCounts.unitCount).toBe(perTeam * 2);
  });

  it('生成ユニットは全て alive', () => {
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive) aliveCount++;
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(aliveCount).toBe(perTeam * 2);
  });

  it('両チームが存在する', () => {
    initUnits(rng);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = getUnit(i);
      if (!u.alive) continue;
      if (u.team === 0) team0++;
      else team1++;
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(team0).toBe(perTeam);
    expect(team1).toBe(perTeam);
  });
});
