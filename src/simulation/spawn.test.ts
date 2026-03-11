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
import { particleIdx, projectileIdx, unitIdx } from '../pool-index.ts';
import { incMotherships, mothershipIdx, poolCounts } from '../pools.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import { TEAM0, TEAM1 } from '../team.ts';
import type { UnitIndex } from '../types.ts';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from '../types.ts';
import {
  BOMBER_TYPE,
  CRUISER_TYPE,
  DRONE_TYPE,
  FIGHTER_TYPE,
  unitType,
  unitTypeIndex,
} from '../unit-type-accessors.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import {
  captureKiller,
  killParticle,
  killProjectile,
  killUnit,
  spawnParticle,
  spawnProjectile,
  spawnUnit,
} from './spawn.ts';
import { addBeam } from './spawn-beams.ts';
import { onKillUnit, onSpawnUnit } from './spawn-hooks.ts';

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
    expect(u.kills).toBe(0);
    expect(u.vet).toBe(0);
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
});

describe('killUnit', () => {
  it('ユニットを無効化し poolCounts.unitCount を減少させる', () => {
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    expect(poolCounts.units).toBe(1);
    killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(unit(0).alive).toBe(false);
    expect(poolCounts.units).toBe(0);
  });

  it('二重killしても poolCounts が負にならない', () => {
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(poolCounts.units).toBe(0);
  });

  it('フックに killer 引数が伝播される', () => {
    const calls: { victim: UnitIndex; killer: UnitIndex }[] = [];
    onKillUnit((e) => {
      calls.push({ victim: e.victim, killer: e.killer });
    });
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    spawnUnit(1, FIGHTER_TYPE, 100, 100, testRng);
    killUnit(unitIdx(0), captureKiller(unitIdx(1)), KILL_CONTEXT.ProjectileDirect);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.victim).toBe(0);
    expect(calls[0]?.killer).toBe(1);
  });

  it('相打ち: killerFrom で事前キャプチャした情報が正しく伝播される', () => {
    const calls: { victimTeam: number; killerTeam: number | undefined }[] = [];
    onKillUnit((e) => {
      calls.push({ victimTeam: e.victimTeam, killerTeam: e.killerTeam });
    });
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng); // index 0, team 0
    spawnUnit(1, FIGHTER_TYPE, 100, 100, testRng); // index 1, team 1
    // 相打ち: 両方の killer 情報を alive 時点でキャプチャ
    const killer0 = captureKiller(unitIdx(0));
    const killer1 = captureKiller(unitIdx(1));
    killUnit(unitIdx(0), killer1, KILL_CONTEXT.ProjectileDirect);
    killUnit(unitIdx(1), killer0, KILL_CONTEXT.ProjectileDirect);
    expect(calls).toHaveLength(2);
    // 2回目: victim=team1, killer=team0（killerFrom で事前キャプチャ済み）
    expect(calls[1]?.victimTeam).toBe(1);
    expect(calls[1]?.killerTeam).toBe(0);
  });

  it('killer 省略時は NO_UNIT がフックに渡される', () => {
    const calls: { victim: UnitIndex; killer: UnitIndex }[] = [];
    onKillUnit((e) => {
      calls.push({ victim: e.victim, killer: e.killer });
    });
    spawnUnit(0, DRONE_TYPE, 0, 0, testRng);
    killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.killer).toBe(NO_UNIT);
  });

  it('alive ユニットの KilledUnitSnapshot を正しく返す', () => {
    spawnUnit(1, BOMBER_TYPE, 100, 200, testRng);
    const snap = killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(snap).toBeDefined();
    expect(snap?.x).toBe(100);
    expect(snap?.y).toBe(200);
    expect(snap?.team).toBe(1);
    expect(snap?.type).toBe(2);
  });

  it('二重 kill は undefined を返す', () => {
    spawnUnit(0, FIGHTER_TYPE, 50, 60, testRng);
    const first = killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    const second = killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it('返り値は独立オブジェクトで、2回 kill しても互いに影響しない', () => {
    spawnUnit(0, FIGHTER_TYPE, 10, 20, testRng);
    spawnUnit(1, BOMBER_TYPE, 30, 40, testRng);
    const snap1 = killUnit(unitIdx(0), undefined, KILL_CONTEXT.ProjectileDirect);
    const snap2 = killUnit(unitIdx(1), undefined, KILL_CONTEXT.ProjectileDirect);
    expect(snap1).not.toBe(snap2);
    expect(snap1?.x).toBe(10);
    expect(snap2?.x).toBe(30);
  });

  it('Mothership kill で mothershipIdx が NO_UNIT になる', () => {
    const mothershipType = unitTypeIndex('Mothership');
    const idx = spawnUnit(0, mothershipType, 0, 0, testRng);
    incMotherships(0, idx);
    expect(mothershipIdx[0]).toBe(idx);
    killUnit(idx, undefined, KILL_CONTEXT.ProjectileDirect);
    expect(mothershipIdx[0]).toBe(NO_UNIT);
  });

  it('通常ユニット kill で mothershipIdx が変化しない', () => {
    const mothershipType = unitTypeIndex('Mothership');
    const msIdx = spawnUnit(0, mothershipType, 0, 0, testRng);
    incMotherships(0, msIdx);
    const fighterIdx = spawnUnit(0, FIGHTER_TYPE, 100, 100, testRng);
    killUnit(fighterIdx, undefined, KILL_CONTEXT.ProjectileDirect);
    expect(mothershipIdx[0]).toBe(msIdx);
  });

  it('Mothership 二重 kill で decMotherships エラーにならない', () => {
    const mothershipType = unitTypeIndex('Mothership');
    const idx = spawnUnit(0, mothershipType, 0, 0, testRng);
    incMotherships(0, idx);
    killUnit(idx, undefined, KILL_CONTEXT.ProjectileDirect);
    // 二重 kill: alive ガードにより decMotherships は呼ばれない
    expect(() => killUnit(idx, undefined, KILL_CONTEXT.ProjectileDirect)).not.toThrow();
    expect(mothershipIdx[0]).toBe(NO_UNIT);
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
