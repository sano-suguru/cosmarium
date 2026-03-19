import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fillParticlePool,
  fillProjectilePool,
  fillUnitPool,
  kill,
  resetPools,
  resetState,
} from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_UNITS, SH_CIRCLE } from '../constants.ts';
import { MAX_MERGE_EXP, MERGE_STAT_BONUS } from '../merge-config.ts';
import { particleIdx, projectileIdx, unitIdx } from '../pool-index.ts';
import { poolCounts } from '../pools.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import { TEAM0, TEAM1 } from '../team.ts';
import { NO_PARTICLE, NO_PROJECTILE } from '../types.ts';
import { BOMBER_TYPE, CRUISER_TYPE, DRONE_TYPE, FIGHTER_TYPE, unitType } from '../unit-type-accessors.ts';
import { captureKiller, killParticle, killProjectile, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';
import { onSpawnUnit } from './spawn-hooks.ts';

const testRng = () => 0.5;
afterEach(() => {
  resetPools();
  resetState();
});

describe('spawnParticle', () => {
  it('パーティクルを生成し poolCounts.particleCount が増加する', () => {
    const idx = spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    expect(idx).toBe(0);
    expect(poolCounts.particles).toBe(1);
    const p = particle(0);
    expect(p.alive).toBe(true);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.vx).toBe(1);
    expect(p.vy).toBe(-1);
    expect(p.life).toBe(0.5);
    expect(p.maxLife).toBe(0.5);
    expect(p.size).toBe(3);
    expect(p.r).toBe(1);
    expect(p.g).toBe(0.5);
    expect(p.b).toBe(0);
    expect(p.shape).toBe(SH_CIRCLE);
  });

  it('複数生成で空きスロットを探索する', () => {
    const i1 = spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    const i2 = spawnParticle(5, 5, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    expect(i1).toBe(0);
    expect(i2).toBe(1);
    expect(poolCounts.particles).toBe(2);
  });

  it('プール満杯時に NO_PARTICLE を返す', () => {
    fillParticlePool();
    const idx = spawnParticle(0, 0, 0, 0, 1, 1, 1, 1, 1, SH_CIRCLE);
    expect(idx).toBe(NO_PARTICLE);
  });
});

describe('spawnProjectile', () => {
  it('プロジェクタイルを生成する', () => {
    const idx = spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(idx).toBe(0);
    expect(poolCounts.projectiles).toBe(1);
    const p = projectile(0);
    expect(p.alive).toBe(true);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(p.damage).toBe(10);
    expect(p.team).toBe(0);
    expect(p.homing).toBe(false);
    expect(p.aoe).toBe(0);
    expect(p.target).toBe(-1);
  });

  it('オプション引数が反映される', () => {
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 1, 2, 1, 1, 1, { homing: true, aoe: 70, target: unitIdx(42) });
    expect(idx).toBe(0);
    const p = projectile(0);
    expect(p.homing).toBe(true);
    expect(p.aoe).toBe(70);
    expect(p.target).toBe(42);
  });

  it('プール満杯時に NO_PROJECTILE を返す', () => {
    fillProjectilePool();
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 0, 2, 1, 0, 0);
    expect(idx).toBe(NO_PROJECTILE);
  });
});

describe('spawnUnit', () => {
  it('Fighterユニットを生成する (type=1)', () => {
    const idx = spawnUnit(0, FIGHTER_TYPE, 100, 200, testRng);
    expect(idx).toBe(0);
    expect(poolCounts.units).toBe(1);
    const u = unit(0);
    const fighter = unitType(FIGHTER_TYPE);
    expect(u.alive).toBe(true);
    expect(u.team).toBe(0);
    expect(u.type).toBe(1);
    expect(u.x).toBe(100);
    expect(u.y).toBe(200);
    expect(u.hp).toBe(fighter.hp);
    expect(u.maxHp).toBe(fighter.hp);
    expect(u.mass).toBe(fighter.mass);
    expect(u.vx).toBe(0);
    expect(u.vy).toBe(0);
  });

  it('プール満杯時に -1 を返す', () => {
    fillUnitPool();
    const overflow = spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    expect(overflow).toBe(-1);
    expect(poolCounts.units).toBe(POOL_UNITS);
  });

  it('dead スロットを再利用する', () => {
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    kill(unitIdx(0));
    const reused = spawnUnit(1, FIGHTER_TYPE, 50, 50, testRng);
    expect(reused).toBe(0);
    expect(unit(0).team).toBe(1);
    expect(unit(0).x).toBe(50);
  });

  it('mergeExp=0 → mergeMul=1, HP=基礎値', () => {
    const idx = spawnUnit(0, FIGHTER_TYPE, 0, 0, testRng, 0);
    const u = unit(idx);
    const t = unitType(FIGHTER_TYPE);
    expect(u.mergeMul).toBe(1);
    expect(u.hp).toBe(t.hp);
    expect(u.maxHp).toBe(t.hp);
  });

  it('mergeExp=3 → HP/maxHp が (1 + 3 * 0.04) 倍にベイクされる', () => {
    const exp = 3;
    const idx = spawnUnit(0, FIGHTER_TYPE, 0, 0, testRng, exp);
    const u = unit(idx);
    const t = unitType(FIGHTER_TYPE);
    const expectedMul = 1 + exp * MERGE_STAT_BONUS;
    expect(u.mergeMul).toBeCloseTo(expectedMul);
    expect(u.hp).toBeCloseTo(t.hp * expectedMul);
    expect(u.maxHp).toBeCloseTo(t.hp * expectedMul);
  });

  it('mergeExp=MAX_MERGE_EXP（境界値） → 正常動作', () => {
    const idx = spawnUnit(0, DRONE_TYPE, 0, 0, testRng, MAX_MERGE_EXP);
    const u = unit(idx);
    const t = unitType(DRONE_TYPE);
    const expectedMul = 1 + MAX_MERGE_EXP * MERGE_STAT_BONUS;
    expect(u.mergeMul).toBeCloseTo(expectedMul);
    expect(u.hp).toBeCloseTo(t.hp * expectedMul);
    expect(u.maxHp).toBeCloseTo(t.hp * expectedMul);
  });
});

describe('killParticle', () => {
  it('パーティクルを無効化し poolCounts.particleCount を減少させる', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    expect(poolCounts.particles).toBe(1);
    killParticle(particleIdx(0));
    expect(particle(0).alive).toBe(false);
    expect(poolCounts.particles).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    killParticle(particleIdx(0));
    killParticle(particleIdx(0));
    expect(poolCounts.particles).toBe(0);
  });

  it('alive パーティクルの KilledParticleSnapshot を返す', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    const snap = killParticle(particleIdx(0));
    expect(snap).toEqual({ x: 10, y: 20, vx: 1, vy: -1, size: 3, r: 1, g: 0.5, b: 0 });
  });

  it('dead パーティクルに対して undefined を返す', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    killParticle(particleIdx(0));
    const snap = killParticle(particleIdx(0));
    expect(snap).toBeUndefined();
  });
});

describe('killProjectile', () => {
  it('プロジェクタイルを無効化し poolCounts.projectileCount を減少させる', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(poolCounts.projectiles).toBe(1);
    killProjectile(projectileIdx(0));
    expect(projectile(0).alive).toBe(false);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    killProjectile(projectileIdx(0));
    killProjectile(projectileIdx(0));
    expect(poolCounts.projectiles).toBe(0);
  });

  it('alive プロジェクタイルの KilledProjectileSnapshot を返す', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    const snap = killProjectile(projectileIdx(0));
    expect(snap).toBeDefined();
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBe(200);
    expect(snap?.vx).toBe(5);
    expect(snap?.vy).toBe(-3);
    expect(snap?.damage).toBe(10);
    expect(snap?.aoe).toBe(0);
  });

  it('dead プロジェクタイルに対して undefined を返す', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    killProjectile(projectileIdx(0));
    const snap = killProjectile(projectileIdx(0));
    expect(snap).toBeUndefined();
  });
});

describe('captureKiller', () => {
  it('alive ユニットの team/type を返す', () => {
    const idx = spawnUnit(1, CRUISER_TYPE, 100, 200, testRng);
    const k = captureKiller(idx);
    if (!k) {
      throw new Error('expected killer');
    }
    expect(k.index).toBe(idx);
    expect(k.team).toBe(1);
    expect(k.type).toBe(3);
  });

  it('dead ユニットに対して undefined を返す', () => {
    const idx = spawnUnit(0, FIGHTER_TYPE, 50, 50, testRng);
    kill(idx);
    expect(captureKiller(idx)).toBeUndefined();
  });
});

describe('addBeam', () => {
  it('beams配列にビームを追加する', () => {
    addBeam(0, 0, 100, 100, 1, 0, 0, 0.5, 2);
    expect(beams).toHaveLength(1);
    expect(beams[0]).toEqual({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      r: 1,
      g: 0,
      b: 0,
      life: 0.5,
      maxLife: 0.5,
      width: 2,
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });
  });

  it('複数ビームが蓄積される', () => {
    addBeam(0, 0, 10, 10, 1, 1, 1, 1, 1);
    addBeam(20, 20, 30, 30, 0, 1, 0, 0.5, 3);
    expect(beams).toHaveLength(2);
  });
});

describe('onSpawnUnit', () => {
  it('spawnUnit 呼び出し時にフックが発火する', () => {
    const hook = vi.fn();
    onSpawnUnit(hook);
    const idx = spawnUnit(TEAM0, FIGHTER_TYPE, 10, 20, testRng);
    expect(hook).toHaveBeenCalledOnce();
    const call = hook.mock.calls[0];
    if (!call) {
      throw new Error('hook not called');
    }
    const event = call[0];
    expect(event.unitIndex).toBe(idx);
    expect(event.team).toBe(TEAM0);
    expect(event.type).toBe(FIGHTER_TYPE);
  });

  it('unsubscribe 後はフックが発火しない', () => {
    const hook = vi.fn();
    const unsub = onSpawnUnit(hook);
    unsub();
    spawnUnit(TEAM0, DRONE_TYPE, 0, 0, testRng);
    expect(hook).not.toHaveBeenCalled();
  });

  it('複数フックが全て発火する', () => {
    const hook1 = vi.fn();
    const hook2 = vi.fn();
    onSpawnUnit(hook1);
    onSpawnUnit(hook2);
    spawnUnit(TEAM1, BOMBER_TYPE, 50, 60, testRng);
    expect(hook1).toHaveBeenCalledOnce();
    expect(hook2).toHaveBeenCalledOnce();
  });

  it('各 spawn ごとに正しいデータがフックに渡される', () => {
    // SpawnEvent はプール再利用されるため、呼び出し時にコピーして保存
    const events: { unitIndex: number; team: number; type: number }[] = [];
    onSpawnUnit((e) => {
      events.push({ unitIndex: e.unitIndex, team: e.team, type: e.type });
    });
    const idx0 = spawnUnit(TEAM0, FIGHTER_TYPE, 10, 20, testRng);
    const idx1 = spawnUnit(TEAM1, CRUISER_TYPE, 30, 40, testRng);
    expect(events).toHaveLength(2);
    // 1回目の spawn イベント
    expect(events[0]?.unitIndex).toBe(idx0);
    expect(events[0]?.team).toBe(TEAM0);
    expect(events[0]?.type).toBe(FIGHTER_TYPE);
    // 2回目の spawn イベント
    expect(events[1]?.unitIndex).toBe(idx1);
    expect(events[1]?.team).toBe(TEAM1);
    expect(events[1]?.type).toBe(CRUISER_TYPE);
  });
});
