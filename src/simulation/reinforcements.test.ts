import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getUnit, poolCounts } from '../pools.ts';
import { state } from '../state.ts';
import { reinforce } from './reinforcements.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('reinforce', () => {
  it('reinforcementTimer < 2.5 → スポーンなし（タイマー蓄積のみ）', () => {
    state.reinforcementTimer = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    reinforce(1.0);
    expect(state.reinforcementTimer).toBe(1.0);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('dt累積で2.5sに到達 → スポーン発動', () => {
    state.reinforcementTimer = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0); // reinforcementTimer = 3.0 >= 2.5
    expect(poolCounts.unitCount).toBeGreaterThan(0);
  });

  it('reinforcementTimer >= 2.5 → タイマーリセット + スポーン実行', () => {
    state.reinforcementTimer = 2.0;
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(0.6); // rT = 2.6 >= 2.5
    expect(state.reinforcementTimer).toBe(0);
    expect(poolCounts.unitCount).toBeGreaterThan(0);
  });

  it('最低 Drone×8 + Fighter×2 が両チームにスポーン (r=0.99)', () => {
    state.reinforcementTimer = 2.5;
    // r=0.99 だとほとんどの条件付きスポーンがスキップされる
    // r > 0.95 のみ: Chain Bolt がスポーン
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(0.1);
    // 各チーム: Drone×8 + Fighter×2 + ChainBolt×1 = 11, 両チーム = 22
    expect(poolCounts.unitCount).toBe(22);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    state.reinforcementTimer = 2.5;
    // reinforce() 内の確率テーブル: r<0.1 → Flagship (cnt<50 条件付き)
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    reinforce(0.1);
    // r=0.05: Drone×8, Fighter×2, Bomber(r<0.5), Cruiser(r<0.4),
    //   Flagship(r<0.1 && cnt<50), Carrier(r<0.18 && cnt<40)
    // 各チーム: 8+2+1+1+1+1 = 14, 両チーム = 28
    expect(poolCounts.unitCount).toBe(28);
    // Flagship (type=4) が存在することを確認
    let hasFlagship = false;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (getUnit(i).alive && getUnit(i).type === 4) {
        hasFlagship = true;
        break;
      }
    }
    expect(hasFlagship).toBe(true);
  });

  it('閾値130体以上でスポーンなし', () => {
    state.reinforcementTimer = 2.5;
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // チーム0に130体配置
    for (let i = 0; i < 130; i++) spawnAt(0, 0, i * 20, 0);
    reinforce(0.1);
    // チーム0は閾値以上なのでスポーンなし、チーム1は0体なのでスポーンあり
    // チーム1: Drone×8 + Fighter×2 + ChainBolt×1 = 11
    expect(poolCounts.unitCount).toBe(130 + 11);
  });

  it('両チーム (0, 1) にそれぞれスポーンされる', () => {
    state.reinforcementTimer = 2.5;
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
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
  });
});
