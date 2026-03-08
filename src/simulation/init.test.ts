import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, reviveParticle, reviveProjectile, reviveUnit } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { DEFAULT_BUDGET } from '../fleet-cost.ts';
import { getUnitHWM, mothershipIdx, particle, poolCounts, projectile, teamUnitCounts, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { NO_UNIT, TEAM0, TEAM1, TEAM2, TEAM3, TEAM4 } from '../types.ts';
import { unitTypeIndex } from '../unit-types.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { generateEnemyFleet } from './enemy-fleet.ts';
import { INIT_SPAWNS, initBattle, initMelee, initUnits } from './init.ts';

function generateFleets(numTeams: number, budget: number): ReturnType<typeof generateEnemyFleet>['fleet'][] {
  return Array.from({ length: numTeams }, () => generateEnemyFleet(budget, rng).fleet);
}

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('initUnits', () => {
  it('全ユニットの alive を false にリセットしてから再生成する', () => {
    reviveUnit(0);
    reviveUnit(1);
    initUnits(rng);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it('全パーティクルの alive を false にリセットする', () => {
    reviveParticle(0);
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PARTICLES; i++) {
      if (particle(i).alive) {
        aliveCount++;
      }
    }
    expect(aliveCount).toBe(0);
  });

  it('全プロジェクタイルの alive を false にリセットする', () => {
    reviveProjectile(0);
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_PROJECTILES; i++) {
      if (projectile(i).alive) {
        aliveCount++;
      }
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

  it('両チーム合計 (n合計+母艦) × 2チーム ユニットを生成する', () => {
    initUnits(rng);
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0) + 1; // +1 for Mothership
    expect(poolCounts.units).toBe(perTeam * 2);
  });

  it('生成ユニットは全て alive', () => {
    initUnits(rng);
    let aliveCount = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unit(i).alive) {
        aliveCount++;
      }
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0) + 1; // +1 for Mothership
    expect(aliveCount).toBe(perTeam * 2);
  });

  it('両チームが存在する', () => {
    initUnits(rng);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = unit(i);
      if (!u.alive) {
        continue;
      }
      if (u.team === 0) {
        team0++;
      } else {
        team1++;
      }
    }
    const perTeam = INIT_SPAWNS.reduce((a, s) => a + s.count, 0) + 1; // +1 for Mothership
    expect(team0).toBe(perTeam);
    expect(team1).toBe(perTeam);
  });
});

describe('initMelee', () => {
  it('2勢力で各チームにユニットがスポーンされる', () => {
    initMelee(generateFleets(2, DEFAULT_BUDGET), rng);
    expect(poolCounts.units).toBeGreaterThan(0);
    expect(teamUnitCounts[0]).toBeGreaterThan(0);
    expect(teamUnitCounts[1]).toBeGreaterThan(0);
  });

  it('5勢力で全チームにユニットがスポーンされる', () => {
    initMelee(generateFleets(5, DEFAULT_BUDGET), rng);
    expect(poolCounts.units).toBeGreaterThan(0);
    for (const t of [TEAM0, TEAM1, TEAM2, TEAM3, TEAM4]) {
      expect(teamUnitCounts[t]).toBeGreaterThan(0);
    }
  });

  it('各チームのユニット配置が異なる中心位置を持つ', () => {
    initMelee(generateFleets(3, DEFAULT_BUDGET), rng);
    // チーム別の平均位置を計算
    const cx = [0, 0, 0];
    const counts = [0, 0, 0];
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = unit(i);
      if (!u.alive) {
        continue;
      }
      const t: number = u.team;
      cx[t] = (cx[t] ?? 0) + u.x;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    // 各チームの平均X座標が異なることを確認（円周配置）
    const avgX = cx.map((sum, i) => ((counts[i] ?? 1) > 0 ? (sum ?? 0) / (counts[i] ?? 1) : 0));
    // 少なくとも2つのチームの平均位置が有意に異なる
    const diff01 = Math.abs((avgX[0] ?? 0) - (avgX[1] ?? 0));
    const diff02 = Math.abs((avgX[0] ?? 0) - (avgX[2] ?? 0));
    expect(diff01 + diff02).toBeGreaterThan(100);
  });
});

describe('initBattle — 母艦自動配備', () => {
  const MOTHERSHIP = unitTypeIndex('Mothership');
  const playerFleet = [{ type: 0, count: 5 }];
  const enemyFleet = [{ type: 0, count: 5 }];

  it('各チームに Mothership タイプのユニットが1体存在する', () => {
    initBattle(playerFleet, enemyFleet, rng);
    for (let t = 0; t < 2; t++) {
      let mothershipCount = 0;
      for (let i = 0; i < getUnitHWM(); i++) {
        const u = unit(i);
        if (u.alive && u.team === t && u.type === MOTHERSHIP) {
          mothershipCount++;
        }
      }
      expect(mothershipCount).toBe(1);
    }
  });

  it('mothershipIdx が各チームで有効値', () => {
    initBattle(playerFleet, enemyFleet, rng);
    expect(mothershipIdx[0]).not.toBe(NO_UNIT);
    expect(mothershipIdx[1]).not.toBe(NO_UNIT);
  });

  it('SPECTATE (initUnits) でも各チームに母艦がスポーンされる', () => {
    initUnits(rng);
    expect(mothershipIdx[0]).not.toBe(NO_UNIT);
    expect(mothershipIdx[1]).not.toBe(NO_UNIT);
    let mothershipCount = 0;
    for (let i = 0; i < getUnitHWM(); i++) {
      if (unit(i).alive && unit(i).type === MOTHERSHIP) {
        mothershipCount++;
      }
    }
    expect(mothershipCount).toBe(2);
  });

  it('MELEE (initMelee) で各チームに母艦がスポーンされる', () => {
    initMelee(generateFleets(3, DEFAULT_BUDGET), rng);
    for (const t of [TEAM0, TEAM1, TEAM2]) {
      expect(mothershipIdx[t]).not.toBe(NO_UNIT);
    }
    // Mothership タイプのユニットがチームごとに1体
    for (let t = 0; t < 3; t++) {
      let mothershipCount = 0;
      for (let i = 0; i < getUnitHWM(); i++) {
        const u = unit(i);
        if (u.alive && u.team === t && u.type === MOTHERSHIP) {
          mothershipCount++;
        }
      }
      expect(mothershipCount).toBe(1);
    }
  });
});
