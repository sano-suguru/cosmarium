import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_MODS, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts } from '../pools.ts';
import { projectile, unit } from '../pools-query.ts';
import { rng } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import {
  AMPLIFIER_TYPE,
  CRUISER_TYPE,
  DRONE_TYPE,
  FIGHTER_TYPE,
  LANCER_TYPE,
  SCORCHER_TYPE,
  unitType,
  unitTypeIndex,
} from '../unit-type-accessors.ts';
import { combat, demoFlag } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { AMP_DAMAGE_MULT, CATALYST_COOLDOWN_MULT, SCRAMBLE_COOLDOWN_MULT } from './combat-support.ts';
import { _resetSweepHits } from './combat-sweep.ts';
import { buildHash } from './spatial-hash.ts';
import { onKillUnit } from './spawn-hooks.ts';
import { AMP_RANGE_MULT, SCRAMBLE_RANGE_MULT } from './steering.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const shake = vi.fn();

describe('combat — 共通', () => {
  it('stun>0 → 即return（何も起きない）', () => {
    const idx = spawnAt(0, FIGHTER_TYPE, 0, 0);
    const u = unit(idx);
    u.stun = 1.0;
    u.cooldown = 0;
    u.target = NO_UNIT;
    buildHash();
    combat(u, idx, 0.016, rng, NEUTRAL_MODS, shake);
    // cooldown はスタン中変化しない
    expect(u.cooldown).toBe(0);
  });

  it('cooldown, abilityCooldown がdt分減少する', () => {
    const idx = spawnAt(0, FIGHTER_TYPE, 0, 0);
    const u = unit(idx);
    u.cooldown = 1.0;
    u.abilityCooldown = 0.5;
    u.target = NO_UNIT;
    buildHash();
    combat(u, idx, 0.016, rng, NEUTRAL_MODS, shake);
    expect(u.cooldown).toBeCloseTo(1.0 - 0.016);
    expect(u.abilityCooldown).toBeCloseTo(0.5 - 0.016);
  });
});

describe('combat — UNIT STATS', () => {
  it('Cruiser(type 3) に sweep: true がある', () => {
    expect(unitType(CRUISER_TYPE).sweep).toBe(true);
  });

  it('Cruiser の fireRate は 1.5', () => {
    expect(unitType(CRUISER_TYPE).fireRate).toBe(1.5);
  });

  it('Cruiser の damage は 8', () => {
    expect(unitType(CRUISER_TYPE).damage).toBe(8);
  });

  it('Scorcher(type 12) の fireRate は 0.1', () => {
    expect(unitType(SCORCHER_TYPE).fireRate).toBe(0.1);
  });

  it('Scorcher の damage は 0.8', () => {
    expect(unitType(SCORCHER_TYPE).damage).toBe(0.8);
  });

  it('Scorcher に sweep がない', () => {
    expect(unitType(SCORCHER_TYPE).sweep).toBe(false);
  });
});

describe('combat — COOLDOWN REGRESSION', () => {
  it('Fighter(type 1) の cooldown は dt 分だけ減少する', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE, 0, 0);
    unit(fighter).cooldown = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.1, rng, NEUTRAL_MODS, shake);
    expect(unit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('Beam unit(Cruiser type 3) の cooldown も dt 分だけ減少する（二重デクリメントしない）', () => {
    const cruiser = spawnAt(0, CRUISER_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE, 100, 0);
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).target = enemy;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, rng, NEUTRAL_MODS, shake);
    expect(unit(cruiser).cooldown).toBeCloseTo(0.9);
  });
});

describe('combat — AMPLIFIER buff effects', () => {
  const FIGHTER_TYPE_C = FIGHTER_TYPE;

  it('ampBoostTimer > 0 のユニットの射程が AMP_RANGE_MULT 倍に拡張', () => {
    const t = unitType(FIGHTER_TYPE_C);
    const baseRange = t.attackRange;
    const extendedRange = baseRange * AMP_RANGE_MULT;

    // 基本射程外、バフ射程内に敵を配置
    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, baseRange + 5, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).ampBoostTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);

    // バフにより射程が拡張されるので射撃が発生
    expect(baseRange + 5).toBeLessThan(extendedRange);
    // cooldownがリセットされていれば射撃が発生した証拠
    expect(unit(fighter).cooldown).toBeGreaterThan(0);
  });

  it('ampBoostTimer = 0 では射程拡張なし', () => {
    const t = unitType(FIGHTER_TYPE_C);
    const baseRange = t.attackRange;

    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, baseRange + 5, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).ampBoostTimer = 0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);

    // 射程外なので射撃せず、cooldownは0以下のまま
    expect(unit(fighter).cooldown).toBeLessThanOrEqual(0);
  });

  it('ampBoostTimer > 0 のユニットが AMP_DAMAGE_MULT 倍のダメージを与える', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE_C, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).ampBoostTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);
    expect(projectile(0).damage).toBeCloseTo(unitType(FIGHTER_TYPE_C).damage * AMP_DAMAGE_MULT);
  });

  it('Amplifier は非排他で通常射撃にフォールスルーする', () => {
    const amp = spawnAt(0, AMPLIFIER_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_C, 100, 0);
    unit(amp).target = enemy;
    unit(amp).cooldown = 0;
    buildHash();
    combat(unit(amp), amp, 0.016, rng, NEUTRAL_MODS, shake);
    // Amplifierは通常射撃にフォールスルーするのでcooldownがfireRate以上にリセットされる
    expect(unit(amp).cooldown).toBeGreaterThan(0);
  });

  it('demoFlag は amplifies を返す', () => {
    expect(demoFlag(unitType(AMPLIFIER_TYPE))).toBe('amplifies');
  });
});

describe('combat — KillEvent 伝播', () => {
  it('ramTarget: 敵kill時の KillEvent に攻撃者情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const lancer = spawnAt(0, LANCER_TYPE, 0, 0);
    const enemy = spawnAt(1, DRONE_TYPE, 5, 0); // hp=3
    buildHash();
    combat(unit(lancer), lancer, 0.016, rng, NEUTRAL_MODS, shake);
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(9);
  });

  it('ramTarget: 相打ち時に双方の KillEvent が正しい killer 情報を持つ', () => {
    const events: { victimTeam: number; killerTeam: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ victimTeam: e.victimTeam, killerTeam: e.killerTeam });
    });
    const lancer = spawnAt(0, LANCER_TYPE, 0, 0);
    unit(lancer).hp = 1; // 自傷で死亡
    const enemy = spawnAt(1, DRONE_TYPE, 5, 0); // hp=3, mass=1
    buildHash();
    combat(unit(lancer), lancer, 0.016, rng, NEUTRAL_MODS, shake);
    // Drone は Lancer の衝突ダメージで死亡、Lancer は自傷 ceil(Drone.mass)=1 で死亡
    expect(unit(enemy).alive).toBe(false);
    expect(unit(lancer).alive).toBe(false);
    expect(events).toHaveLength(2);
    const enemyKill = events.find((e) => e.victimTeam === 1);
    const lancerKill = events.find((e) => e.victimTeam === 0);
    expect(enemyKill?.killerTeam).toBe(0); // lancer が killer
    expect(lancerKill?.killerTeam).toBe(1); // drone が killer
  });

  it('focusBeam: 敵kill時の KillEvent に射撃元情報が含まれる', () => {
    const events: { killerTeam: number | undefined; killerType: number | undefined }[] = [];
    onKillUnit((e) => {
      events.push({ killerTeam: e.killerTeam, killerType: e.killerType });
    });
    const scorcher = spawnAt(0, SCORCHER_TYPE, 0, 0);
    const enemy = spawnAt(1, DRONE_TYPE, 100, 0); // hp=3
    unit(enemy).hp = 0.1; // 最小HPでkill確定
    unit(scorcher).target = enemy;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 2.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, rng, NEUTRAL_MODS, shake);
    expect(unit(enemy).alive).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.killerTeam).toBe(0);
    expect(events[0]?.killerType).toBe(12);
  });
});

describe('combat — SCRAMBLER debuff effects', () => {
  const SCRAMBLER_TYPE = unitTypeIndex('Scrambler');
  const FIGHTER_TYPE_S = FIGHTER_TYPE;

  it('scrambleTimer > 0 でクールダウン回復が遅延', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE_S, 0, 0);
    unit(fighter).cooldown = 1.0;
    unit(fighter).scrambleTimer = 1.0;
    unit(fighter).target = NO_UNIT;
    buildHash();
    const dt = 0.5;
    combat(unit(fighter), fighter, dt, rng, NEUTRAL_MODS, shake);
    // scramble 中はクールダウンが dt * SCRAMBLE_COOLDOWN_MULT だけ減少
    expect(unit(fighter).cooldown).toBeCloseTo(1.0 - dt * SCRAMBLE_COOLDOWN_MULT, 2);
  });

  it('scrambleTimer > 0 で射程が縮小し射撃不発', () => {
    const t = unitType(FIGHTER_TYPE_S);
    const baseRange = t.attackRange;
    const scrambledRange = baseRange * SCRAMBLE_RANGE_MULT;

    // 基本射程内だが scramble 射程外に配置
    const dist = scrambledRange + 5;
    expect(dist).toBeLessThan(baseRange);

    const fighter = spawnAt(0, FIGHTER_TYPE_S, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_S, dist, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).scrambleTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);
    // 射程外なので射撃せず
    expect(unit(fighter).cooldown).toBeLessThanOrEqual(0);
  });

  it('scrambleTimer = 0 では射程縮小なし（対照）', () => {
    const t = unitType(FIGHTER_TYPE_S);
    const baseRange = t.attackRange;
    const scrambledRange = baseRange * SCRAMBLE_RANGE_MULT;
    const dist = scrambledRange + 5;

    const fighter = spawnAt(0, FIGHTER_TYPE_S, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_S, dist, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).scrambleTimer = 0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);
    // scramble なしなら通常射程内で射撃成功
    expect(unit(fighter).cooldown).toBeGreaterThan(0);
  });

  it('amp + scramble が乗算的にスタック', () => {
    const t = unitType(FIGHTER_TYPE_S);
    const baseRange = t.attackRange;
    const combinedRange = baseRange * AMP_RANGE_MULT * SCRAMBLE_RANGE_MULT;

    const fighter = spawnAt(0, FIGHTER_TYPE_S, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_S, combinedRange - 5, 0);
    unit(fighter).target = enemy;
    unit(fighter).cooldown = 0;
    unit(fighter).ampBoostTimer = 1.0;
    unit(fighter).scrambleTimer = 1.0;
    buildHash();
    combat(unit(fighter), fighter, 0.016, rng, NEUTRAL_MODS, shake);
    // 乗算射程内なので射撃成功
    expect(unit(fighter).cooldown).toBeGreaterThan(0);
  });

  it('Scrambler は排他的に処理され射撃しない', () => {
    const scrambler = spawnAt(0, SCRAMBLER_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE_S, 50, 0);
    unit(scrambler).target = enemy;
    unit(scrambler).cooldown = 0;
    buildHash();
    combat(unit(scrambler), scrambler, 0.016, rng, NEUTRAL_MODS, shake);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('demoFlag は scrambles を返す', () => {
    expect(demoFlag(unitType(SCRAMBLER_TYPE))).toBe('scrambles');
  });
});

describe('combat — CATALYST buff effects', () => {
  const CATALYST_TYPE = unitTypeIndex('Catalyst');

  it('catalystTimer > 0 でクールダウン回復が加速', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE, 0, 0);
    unit(fighter).cooldown = 1.0;
    unit(fighter).catalystTimer = 1.0;
    unit(fighter).target = NO_UNIT;
    buildHash();
    const dt = 0.5;
    combat(unit(fighter), fighter, dt, rng, NEUTRAL_MODS, shake);
    expect(unit(fighter).cooldown).toBeCloseTo(1.0 - dt * CATALYST_COOLDOWN_MULT, 2);
  });

  it('catalyst + scramble が乗算的にスタック', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE, 0, 0);
    unit(fighter).cooldown = 1.0;
    unit(fighter).catalystTimer = 1.0;
    unit(fighter).scrambleTimer = 1.0;
    unit(fighter).target = NO_UNIT;
    buildHash();
    const dt = 0.5;
    combat(unit(fighter), fighter, dt, rng, NEUTRAL_MODS, shake);
    expect(unit(fighter).cooldown).toBeCloseTo(1.0 - dt * SCRAMBLE_COOLDOWN_MULT * CATALYST_COOLDOWN_MULT, 2);
  });

  it('catalystTimer = 0 では効果なし（対照群）', () => {
    const fighter = spawnAt(0, FIGHTER_TYPE, 0, 0);
    unit(fighter).cooldown = 1.0;
    unit(fighter).catalystTimer = 0;
    unit(fighter).target = NO_UNIT;
    buildHash();
    const dt = 0.5;
    combat(unit(fighter), fighter, dt, rng, NEUTRAL_MODS, shake);
    expect(unit(fighter).cooldown).toBeCloseTo(1.0 - dt, 2);
  });

  it('Catalyst 自身の通常射撃が発動する（非排他）', () => {
    const catalyst = spawnAt(0, CATALYST_TYPE, 0, 0);
    const enemy = spawnAt(1, FIGHTER_TYPE, 80, 0);
    unit(catalyst).target = enemy;
    unit(catalyst).cooldown = 0;
    unit(catalyst).angle = 0;
    buildHash();
    combat(unit(catalyst), catalyst, 0.016, rng, NEUTRAL_MODS, shake);
    expect(poolCounts.projectiles).toBeGreaterThan(0);
  });

  it('demoFlag は catalyzes を返す', () => {
    expect(demoFlag(unitType(CATALYST_TYPE))).toBe('catalyzes');
  });
});
