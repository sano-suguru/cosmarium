import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { poolCounts, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import { REINFORCE_INTERVAL, REINFORCE_UNIT_CAP, reinforce } from './reinforcements.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('reinforce', () => {
  it(`reinforcementTimer < ${REINFORCE_INTERVAL} → スポーンなし（タイマー蓄積のみ）`, () => {
    state.reinforcementTimer = 0;
    reinforce(1.0, rng, state);
    expect(state.reinforcementTimer).toBe(1.0);
    expect(poolCounts.units).toBe(0);
  });

  it(`dt累積で${REINFORCE_INTERVAL}sに到達 → スポーン発動`, () => {
    state.reinforcementTimer = 0;
    state.rng = () => 0.99;
    reinforce(1.0, rng, state);
    expect(poolCounts.units).toBe(0);
    reinforce(1.0, rng, state);
    expect(poolCounts.units).toBe(0);
    reinforce(1.0, rng, state);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it(`reinforcementTimer >= ${REINFORCE_INTERVAL} → タイマーリセット + スポーン実行`, () => {
    state.reinforcementTimer = REINFORCE_INTERVAL - 0.5;
    state.rng = () => 0.99;
    reinforce(0.6, rng, state);
    expect(state.reinforcementTimer).toBe(0);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it('最低 Drone×8 + Fighter×2 が両チームにスポーン (r=0.99)', () => {
    state.reinforcementTimer = REINFORCE_INTERVAL;
    state.rng = () => 0.99;
    reinforce(0.1, rng, state);
    expect(poolCounts.units).toBe(22);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    state.reinforcementTimer = REINFORCE_INTERVAL;
    state.rng = () => 0.05;
    reinforce(0.1, rng, state);
    expect(poolCounts.units).toBe(28);
    let hasFlagship = false;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unit(i).alive && unit(i).type === 4) {
        hasFlagship = true;
        break;
      }
    }
    expect(hasFlagship).toBe(true);
  });

  it(`閾値${REINFORCE_UNIT_CAP}体以上でスポーンなし`, () => {
    state.reinforcementTimer = REINFORCE_INTERVAL;
    state.rng = () => 0.99;
    for (let i = 0; i < REINFORCE_UNIT_CAP; i++) spawnAt(0, 0, i * 20, 0);
    reinforce(0.1, rng, state);
    expect(poolCounts.units).toBe(REINFORCE_UNIT_CAP + 11);
  });

  it('両チーム (0, 1) にそれぞれスポーンされる', () => {
    state.reinforcementTimer = REINFORCE_INTERVAL;
    state.rng = () => 0.99;
    reinforce(0.1, rng, state);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (!unit(i).alive) continue;
      if (unit(i).team === 0) team0++;
      else team1++;
    }
    expect(team0).toBeGreaterThan(0);
    expect(team1).toBeGreaterThan(0);
    expect(team0).toBe(team1);
  });
});
