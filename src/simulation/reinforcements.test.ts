import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { poolCounts, unitPool } from '../pools.ts';
import { reinforcementTimer, setGameMode, setReinforcementTimer } from '../state.ts';
import { reinforce } from './reinforcements.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('reinforce', () => {
  it('gameMode===1 (ANNIHILATION) → 何もしない', () => {
    setGameMode(1);
    setReinforcementTimer(3.0);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    // gameMode===1 では rT 更新前に即 return
    expect(reinforcementTimer).toBe(3.0);
  });

  it('rT < 2.5 → スポーンなし（タイマー蓄積のみ）', () => {
    setGameMode(0);
    setReinforcementTimer(0);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    reinforce(1.0);
    expect(reinforcementTimer).toBe(1.0);
    expect(poolCounts.unitCount).toBe(0);
  });

  it('dt累積で2.5sに到達 → スポーン発動', () => {
    setGameMode(0);
    setReinforcementTimer(0);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0);
    expect(poolCounts.unitCount).toBe(0);
    reinforce(1.0); // rT = 3.0 >= 2.5
    expect(poolCounts.unitCount).toBeGreaterThan(0);
  });

  it('rT >= 2.5 → タイマーリセット + スポーン実行', () => {
    setGameMode(0);
    setReinforcementTimer(2.0);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(0.6); // rT = 2.6 >= 2.5
    expect(reinforcementTimer).toBe(0);
    expect(poolCounts.unitCount).toBeGreaterThan(0);
  });

  // 以下のテストは reinforce() 内の確率テーブルに依存（r の閾値でユニット種が決定される）
  it('最低 Drone×5 + Fighter×2 が両チームにスポーン (r=0.99)', () => {
    setGameMode(0);
    setReinforcementTimer(2.5);
    // r=0.99 だとほとんどの条件付きスポーンがスキップされる
    // r > 0.95 のみ: Chain Bolt がスポーン
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(0.1);
    // 各チーム: Drone×5 + Fighter×2 + ChainBolt×1 = 8, 両チーム = 16
    expect(poolCounts.unitCount).toBe(16);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    setGameMode(0);
    setReinforcementTimer(2.5);
    // reinforce() 内の確率テーブル: r<0.1 → Flagship (cnt<50 条件付き)
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    reinforce(0.1);
    // r=0.05: Drone×5, Fighter×2, Bomber(r<0.5), Cruiser(r<0.4),
    //   Flagship(r<0.1 && cnt<50), Carrier(r<0.18 && cnt<40)
    // 各チーム: 5+2+1+1+1+1 = 11, 両チーム = 22
    expect(poolCounts.unitCount).toBe(22);
    // Flagship (type=4) が存在することを確認
    let hasFlagship = false;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (unitPool[i]!.alive && unitPool[i]!.type === 4) {
        hasFlagship = true;
        break;
      }
    }
    expect(hasFlagship).toBe(true);
  });

  it('gameMode===2 → 閾値100, gameMode===0 → 閾値130', () => {
    // gameMode===0: 閾値130 → 130体以上なら新規スポーンなし
    setGameMode(0);
    setReinforcementTimer(2.5);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // チーム0に130体配置
    for (let i = 0; i < 130; i++) spawnAt(0, 0, i * 20, 0);
    reinforce(0.1);
    // チーム0は閾値以上なのでスポーンなし、チーム1は0体なのでスポーンあり
    // チーム1: Drone×5 + Fighter×2 + ChainBolt×1 = 8
    expect(poolCounts.unitCount).toBe(130 + 8);
  });

  it('gameMode===2 → 閾値100（100体以上でスポーンなし）', () => {
    setGameMode(2);
    setReinforcementTimer(2.5);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // チーム0に100体配置
    for (let i = 0; i < 100; i++) spawnAt(0, 0, i * 20, 0);
    reinforce(0.1);
    // チーム0は閾値以上、チーム1だけスポーン
    expect(poolCounts.unitCount).toBe(100 + 8);
  });

  it('両チーム (0, 1) にそれぞれスポーンされる', () => {
    setGameMode(0);
    setReinforcementTimer(2.5);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    reinforce(0.1);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (!unitPool[i]!.alive) continue;
      if (unitPool[i]!.team === 0) team0++;
      else team1++;
    }
    expect(team0).toBeGreaterThan(0);
    expect(team1).toBeGreaterThan(0);
    expect(team0).toBe(team1);
  });
});
