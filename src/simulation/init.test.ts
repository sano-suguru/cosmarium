import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { particle, poolCounts, projectile, unit } from '../pools.ts';
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
    unit(0).alive = true;
    unit(1).alive = true;
    initUnits(rng);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it('全パーティクルの alive を false にリセットする', () => {
    particle(0).alive = true;
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PARTICLES; i++) {
      if (particle(i).alive) aliveCount++;
    }
    expect(aliveCount).toBe(0);
  });

  it('全プロジェクタイルの alive を false にリセットする', () => {
    projectile(0).alive = true;
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PROJECTILES; i++) {
      if (projectile(i).alive) aliveCount++;
    }
    expect(aliveCount).toBe(0);
  });

  it('beams を空にする', () => {
    beams.push({
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      r: 1,
      g: 0,
      b: 0,
      life: 1,
      maxLife: 1,
      width: 1,
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });
    initUnits(rng);
    expect(beams).toHaveLength(0);
  });

  it('両チーム合計 n合計 × 2チーム ユニットを生成する', () => {
    initUnits(rng);
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(poolCounts.units).toBe(perTeam * 2);
  });

  it('生成ユニットは全て alive', () => {
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unit(i).alive) aliveCount++;
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(aliveCount).toBe(perTeam * 2);
  });

  it('両チームが存在する', () => {
    initUnits(rng);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = unit(i);
      if (!u.alive) continue;
      if (u.team === 0) team0++;
      else team1++;
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0);
    expect(team0).toBe(perTeam);
    expect(team1).toBe(perTeam);
  });
});
