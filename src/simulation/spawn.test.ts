import { afterEach, describe, expect, it } from 'vitest';
import { fillParticlePool, fillProjectilePool, fillUnitPool, resetPools, resetState } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { POOL_UNITS, SH_CIRCLE } from '../constants.ts';
import { particle, poolCounts, projectile, unit } from '../pools.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import {
  addBeam,
  captureKiller,
  killParticle,
  killProjectile,
  killUnit,
  onKillUnit,
  spawnParticle,
  spawnProjectile,
  spawnUnit,
} from './spawn.ts';

const testRng = () => 0.5;
const unsubs: (() => void)[] = [];

afterEach(() => {
  for (const fn of unsubs) fn();
  unsubs.length = 0;
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
    const idx = spawnProjectile(0, 0, 0, 0, 1, 5, 1, 2, 1, 1, 1, true, 70, 42 as UnitIndex);
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
    const idx = spawnUnit(0, 1, 100, 200, testRng);
    expect(idx).toBe(0);
    expect(poolCounts.units).toBe(1);
    const u = unit(0);
    const fighter = unitType(1);
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
    expect(u.kills).toBe(0);
    expect(u.vet).toBe(0);
  });

  it('プール満杯時に -1 を返す', () => {
    fillUnitPool();
    const overflow = spawnUnit(0, 0, 0, 0, testRng);
    expect(overflow).toBe(-1);
    expect(poolCounts.units).toBe(POOL_UNITS);
  });

  it('dead スロットを再利用する', () => {
    spawnUnit(0, 0, 0, 0, testRng);
    spawnUnit(0, 0, 0, 0, testRng);
    killUnit(0 as UnitIndex);
    const reused = spawnUnit(1, 1, 50, 50, testRng);
    expect(reused).toBe(0);
    expect(unit(0).team).toBe(1);
    expect(unit(0).x).toBe(50);
  });
});

describe('killUnit', () => {
  it('ユニットを無効化し poolCounts.unitCount を減少させる', () => {
    spawnUnit(0, 0, 0, 0, testRng);
    expect(poolCounts.units).toBe(1);
    killUnit(0 as UnitIndex);
    expect(unit(0).alive).toBe(false);
    expect(poolCounts.units).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnUnit(0, 0, 0, 0, testRng);
    killUnit(0 as UnitIndex);
    killUnit(0 as UnitIndex);
    expect(poolCounts.units).toBe(0);
  });

  it('フックに killer 引数が伝播される', () => {
    const calls: { victim: UnitIndex; killer: UnitIndex }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        calls.push({ victim: e.victim, killer: e.killer });
      }),
    );
    spawnUnit(0, 0, 0, 0, testRng);
    spawnUnit(1, 1, 100, 100, testRng);
    killUnit(0 as UnitIndex, captureKiller(1 as UnitIndex));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.victim).toBe(0);
    expect(calls[0]?.killer).toBe(1);
  });

  it('相打ち: killerFrom で事前キャプチャした情報が正しく伝播される', () => {
    const calls: { victimTeam: number; killerTeam: number | undefined }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        calls.push({ victimTeam: e.victimTeam, killerTeam: e.killerTeam });
      }),
    );
    spawnUnit(0, 0, 0, 0, testRng); // index 0, team 0
    spawnUnit(1, 1, 100, 100, testRng); // index 1, team 1
    // 相打ち: 両方の killer 情報を alive 時点でキャプチャ
    const killer0 = captureKiller(0 as UnitIndex);
    const killer1 = captureKiller(1 as UnitIndex);
    killUnit(0 as UnitIndex, killer1);
    killUnit(1 as UnitIndex, killer0);
    expect(calls).toHaveLength(2);
    // 2回目: victim=team1, killer=team0（killerFrom で事前キャプチャ済み）
    expect(calls[1]?.victimTeam).toBe(1);
    expect(calls[1]?.killerTeam).toBe(0);
  });

  it('killer 省略時は NO_UNIT がフックに渡される', () => {
    const calls: { victim: UnitIndex; killer: UnitIndex }[] = [];
    unsubs.push(
      onKillUnit((e) => {
        calls.push({ victim: e.victim, killer: e.killer });
      }),
    );
    spawnUnit(0, 0, 0, 0, testRng);
    killUnit(0 as UnitIndex);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.killer).toBe(NO_UNIT);
  });

  it('alive ユニットの KilledUnitSnapshot を正しく返す', () => {
    spawnUnit(1, 2, 100, 200, testRng);
    const snap = killUnit(0 as UnitIndex);
    expect(snap).toBeDefined();
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBe(200);
    expect(snap?.team).toBe(1);
    expect(snap?.type).toBe(2);
  });

  it('二重 kill は undefined を返す', () => {
    spawnUnit(0, 1, 50, 60, testRng);
    const first = killUnit(0 as UnitIndex);
    const second = killUnit(0 as UnitIndex);
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it('返り値は独立オブジェクトで、2回 kill しても互いに影響しない', () => {
    spawnUnit(0, 1, 10, 20, testRng);
    spawnUnit(1, 2, 30, 40, testRng);
    const snap1 = killUnit(0 as UnitIndex);
    const snap2 = killUnit(1 as UnitIndex);
    expect(snap1).not.toBe(snap2);
    expect(snap1?.x).toBe(10);
    expect(snap2?.x).toBe(30);
  });
});

describe('killParticle', () => {
  it('パーティクルを無効化し poolCounts.particleCount を減少させる', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    expect(poolCounts.particles).toBe(1);
    killParticle(0 as ParticleIndex);
    expect(particle(0).alive).toBe(false);
    expect(poolCounts.particles).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnParticle(10, 20, 1, -1, 0.5, 3, 1, 0.5, 0, SH_CIRCLE);
    killParticle(0 as ParticleIndex);
    killParticle(0 as ParticleIndex);
    expect(poolCounts.particles).toBe(0);
  });
});

describe('killProjectile', () => {
  it('プロジェクタイルを無効化し poolCounts.projectileCount を減少させる', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    expect(poolCounts.projectiles).toBe(1);
    killProjectile(0 as ProjectileIndex);
    expect(projectile(0).alive).toBe(false);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnProjectile(100, 200, 5, -3, 1.0, 10, 0, 4, 1, 0.5, 0);
    killProjectile(0 as ProjectileIndex);
    killProjectile(0 as ProjectileIndex);
    expect(poolCounts.projectiles).toBe(0);
  });
});

describe('captureKiller', () => {
  it('alive ユニットの team/type を返す', () => {
    const idx = spawnUnit(1, 3, 100, 200, testRng);
    const k = captureKiller(idx);
    expect(k.index).toBe(idx);
    expect(k.team).toBe(1);
    expect(k.type).toBe(3);
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
    });
  });

  it('複数ビームが蓄積される', () => {
    addBeam(0, 0, 10, 10, 1, 1, 1, 1, 1);
    addBeam(20, 20, 30, 30, 0, 1, 0, 0.5, 3);
    expect(beams).toHaveLength(2);
  });
});
