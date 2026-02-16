import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getUnit, poolCounts } from '../pools.ts';
import { seedRng, state } from '../state.ts';
import { reinforce } from './reinforcements.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('reinforce', () => {
  it('reinforcementTimer < 2.5 → スポーンなし（タイマー蓄積のみ）', () => {
    state.reinforcementTimer = 0;
    reinforce(1.0);
    expect(state.reinforcementTimer).toBe(1.0);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('dt累積で2.5sに到達 → スポーン発動', () => {
    state.reinforcementTimer = 0;
    state.rng = () => 0.99;
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBeGreaterThan(0);
    seedRng(12345);
  });

  it('reinforcementTimer >= 2.5 → タイマーリセット + スポーン実行', () => {
    state.reinforcementTimer = 2.0;
    state.rng = () => 0.99;
    reinforce(0.6);
    expect(state.reinforcementTimer).toBe(0);
    expect(poolCounts.unitCount).toBeGreaterThan(0);
    seedRng(12345);
  });

  it('最低 Drone×8 + Fighter×2 が両チームにスポーン (r=0.99)', () => {
    state.reinforcementTimer = 2.5;
    state.rng = () => 0.99;
    reinforce(0.1);
    expect(poolCounts.unitCount).toBe(22);
    seedRng(12345);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    state.reinforcementTimer = 2.5;
    state.rng = () => 0.05;
    reinforce(0.1);
    expect(poolCounts.unitCount).toBe(28);
    let hasFlagship = false;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive && getUnit(i).type === 4) {
        hasFlagship = true;
        break;
      }
    }
    expect(hasFlagship).toBe(true);
    seedRng(12345);
  });

  it('閾値130体以上でスポーンなし', () => {
    state.reinforcementTimer = 2.5;
    state.rng = () => 0.99;
    for (let i = 0; i < 130; i++) spawnAt(0, 0, i * 20, 0);
    reinforce(0.1);
    expect(poolCounts.unitCount).toBe(130 + 11);
    seedRng(12345);
  });

  it('両チーム (0, 1) にそれぞれスポーンされる', () => {
    state.reinforcementTimer = 2.5;
    state.rng = () => 0.99;
    reinforce(0.1);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (!getUnit(i).alive) continue;
      if (getUnit(i).team === 0) team0++;
      else team1++;
    }
    expect(team0).toBeGreaterThan(0);
    expect(team1).toBeGreaterThan(0);
    expect(team0).toBe(team1);
    seedRng(12345);
  });
});
