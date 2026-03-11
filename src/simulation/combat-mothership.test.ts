import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRng, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { MOTHERSHIP_VARIANTS } from '../mothership-variants.ts';
import { getProjectileHWM, incMotherships, poolCounts, setMothershipVariant } from '../pools.ts';
import { projectile, unit } from '../pools-query.ts';
import { TEAM0, TEAM1 } from '../team.ts';
import { NO_UNIT } from '../types.ts';
import type { MothershipVariant } from '../types-fleet.ts';
import { DRONE_TYPE, MOTHERSHIP_TYPE, unitType } from '../unit-type-accessors.ts';
import type { CombatContext } from './combat-context.ts';
import { mothershipCombat } from './combat-mothership.ts';

const DREADNOUGHT_ARMAMENT = MOTHERSHIP_VARIANTS[1].armament;
if (!DREADNOUGHT_ARMAMENT) {
  throw new Error('DREADNOUGHT variant must have armament');
}

function makeCombatCtx(overrides: Partial<CombatContext> = {}): CombatContext {
  return {
    u: undefined as never,
    ui: 0 as never,
    dt: 1 / 60,
    c: [1, 1, 1],
    vd: 1,
    t: unitType(MOTHERSHIP_TYPE),
    range: 0,
    rng: makeRng(),
    shake: vi.fn(),
    ...overrides,
  };
}

function setupMothership(team: typeof TEAM0 | typeof TEAM1, variant: MothershipVariant) {
  const idx = spawnAt(team, MOTHERSHIP_TYPE, 0, 0);
  incMotherships(team, idx);
  setMothershipVariant(team, variant);
  return idx;
}

describe('mothershipCombat', () => {
  const rng = makeRng();

  beforeEach(() => {
    resetPools();
    resetState();
    rng.reset();
  });

  it('Dreadnought で射程内ターゲットに射撃する', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 200, 0);
    m.target = target;
    m.cooldown = 0;
    const initialProj = poolCounts.projectiles;

    const ctx = makeCombatCtx({ u: m, ui: mIdx });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);

    expect(poolCounts.projectiles).toBe(initialProj + 1);
  });

  it('射程外ターゲットには射撃しない', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 600, 0); // range=500 を超えている
    m.target = target;
    m.cooldown = 0;
    const initialProj = poolCounts.projectiles;

    const ctx = makeCombatCtx({ u: m, ui: mIdx });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);

    expect(poolCounts.projectiles).toBe(initialProj);
  });

  it('dead ターゲットで u.target = NO_UNIT にリセット', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 200, 0);
    m.target = target;
    m.cooldown = 0;
    unit(target).alive = false;

    const ctx = makeCombatCtx({ u: m, ui: mIdx });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);

    expect(m.target).toBe(NO_UNIT);
  });

  it('cooldown 中は射撃しない', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 200, 0);
    m.target = target;
    m.cooldown = 5; // まだ高い cooldown
    const initialProj = poolCounts.projectiles;

    const ctx = makeCombatCtx({ u: m, ui: mIdx, dt: 0.016 });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);

    expect(poolCounts.projectiles).toBe(initialProj);
  });

  it('射撃後に cooldown が arm.fireRate にセットされる', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 200, 0);
    m.target = target;
    m.cooldown = 0;

    const ctx = makeCombatCtx({ u: m, ui: mIdx });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);

    expect(m.cooldown).toBe(3.0);
  });

  it('target === NO_UNIT で射撃しない', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    m.cooldown = 0;
    // m.target = NO_UNIT (デフォルト)
    const ctx = makeCombatCtx({ u: m, ui: mIdx });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('vd ダメージ倍率が弾の damage に反映される', () => {
    const mIdx = setupMothership(TEAM0, 1 as MothershipVariant);
    const m = unit(mIdx);
    const target = spawnAt(TEAM1, DRONE_TYPE, 200, 0);
    m.target = target;
    m.cooldown = 0;
    const ctx = makeCombatCtx({ u: m, ui: mIdx, vd: 2.0 });
    mothershipCombat(ctx, DREADNOUGHT_ARMAMENT);
    // HWM 内を走査して alive な projectile を見つける
    let found = false;
    for (let i = 0; i < getProjectileHWM(); i++) {
      const p = projectile(i);
      if (p.alive) {
        expect(p.damage).toBe(DREADNOUGHT_ARMAMENT.damage * 2.0);
        expect(p.aoe).toBe(40);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
