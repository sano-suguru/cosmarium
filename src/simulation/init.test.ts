import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, reviveParticle, reviveProjectile, reviveUnit } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getUnitHWM, mothershipIdx, poolCounts } from '../pools.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import { rng } from '../state.ts';
import { TEAM0, TEAM1, TEAM2, TEAM3, TEAM4 } from '../team.ts';
import { NO_UNIT } from '../types.ts';
import type { FleetSetup, MothershipVariant } from '../types-fleet.ts';
import { unitTypeIndex } from '../unit-type-accessors.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { INIT_SPAWNS, initBattleProduction, initMeleeProduction, initUnits } from './init.ts';

function setup(variant: MothershipVariant = 0): FleetSetup {
  return { variant, slots: [] };
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

describe('母艦自動配備', () => {
  const MOTHERSHIP = unitTypeIndex('Mothership');

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

  it('MELEE (initMeleeProduction) で各チームに母艦がスポーンされる', () => {
    initMeleeProduction(rng, [setup(0), setup(1), setup(2)], 3);
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

describe('initBattleProduction — HP バリアント', () => {
  it('Dreadnought (hpMul=1.5) の母艦は maxHp === hp かつ Hive より高い', () => {
    // Dreadnought(1) vs Hive(0)
    initBattleProduction(rng, setup(1), setup(0));
    const dreadIdx = mothershipIdx[0];
    const hiveIdx = mothershipIdx[1];
    expect(dreadIdx).not.toBe(NO_UNIT);
    expect(hiveIdx).not.toBe(NO_UNIT);

    const dread = unit(dreadIdx);
    const hive = unit(hiveIdx);

    expect(dread.maxHp).toBe(dread.hp);
    expect(hive.maxHp).toBe(hive.hp);
    expect(dread.maxHp).toBeGreaterThan(hive.maxHp);
    // hpMul=1.5 の Dreadnought は Hive(hpMul=1.0) の 1.5 倍
    expect(dread.maxHp).toBe(Math.round(hive.maxHp * 1.5));
  });
});

describe('initMeleeProduction', () => {
  it('N勢力で母艦のみスポーンされる', () => {
    initMeleeProduction(rng, [setup(0), setup(1), setup(2)], 3);
    expect(poolCounts.units).toBe(3);
    for (const t of [TEAM0, TEAM1, TEAM2]) {
      expect(mothershipIdx[t]).not.toBe(NO_UNIT);
    }
    expect(mothershipIdx[TEAM3]).toBe(NO_UNIT);
    expect(mothershipIdx[TEAM4]).toBe(NO_UNIT);
  });

  it('バリアントが各チームに適用される', () => {
    initMeleeProduction(rng, [setup(0), setup(1), setup(2), setup(0), setup(2)], 5);
    expect(poolCounts.units).toBe(5);
    for (const t of [TEAM0, TEAM1, TEAM2, TEAM3, TEAM4]) {
      expect(mothershipIdx[t]).not.toBe(NO_UNIT);
    }
  });
});
