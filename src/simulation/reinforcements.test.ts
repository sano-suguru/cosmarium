import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillUnitPool, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { incMotherships, poolCounts, setUnitCount, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import { TYPES, unitTypeIndex } from '../unit-types.ts';
import type { ReinforcementState } from './reinforcements.ts';
import {
  REINFORCE_INTERVAL,
  REINFORCE_UNIT_CAP,
  REINFORCEMENT_TABLE,
  RUBBER_BAND_RATIO,
  reinforce,
} from './reinforcements.ts';

const MOTHERSHIP_T = unitTypeIndex('Mothership');

function makeRS(timer = 0): ReinforcementState {
  return { reinforcementTimer: timer };
}

/** 両チームに母艦をスポーン済みの状態にする（reinforce の母艦再スポーンを抑止） */
function spawnMotherships() {
  for (const team of [0, 1] as const) {
    const idx = spawnAt(team, MOTHERSHIP_T, team * 500, 0);
    incMotherships(team, idx);
  }
}

/** spawnMotherships() がスポーンする母艦の数（両チーム分） */
const MOTHERSHIP_PAIR = 2;

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('reinforce', () => {
  it(`reinforcementTimer < ${REINFORCE_INTERVAL} → スポーンなし（タイマー蓄積のみ）`, () => {
    const rs = makeRS(0);
    reinforce(1.0, rng, rs);
    expect(rs.reinforcementTimer).toBe(1.0);
    expect(poolCounts.units).toBe(0);
  });

  it(`dt累積で${REINFORCE_INTERVAL}sに到達 → スポーン発動`, () => {
    const rs = makeRS(0);
    state.rng = () => 0.99;
    reinforce(1.0, rng, rs);
    expect(poolCounts.units).toBe(0);
    reinforce(1.0, rng, rs);
    expect(poolCounts.units).toBe(0);
    reinforce(1.0, rng, rs);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it(`reinforcementTimer >= ${REINFORCE_INTERVAL} → タイマーリセット + スポーン実行`, () => {
    const rs = makeRS(REINFORCE_INTERVAL - 0.5);
    state.rng = () => 0.99;
    reinforce(0.6, rng, rs);
    expect(rs.reinforcementTimer).toBe(0);
    expect(poolCounts.units).toBeGreaterThan(0);
  });

  it('最低 Drone×8 + Fighter×2 が両チームにスポーン (r=0.99)', () => {
    spawnMotherships();
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    expect(poolCounts.units).toBe(24 + MOTHERSHIP_PAIR);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    spawnMotherships();
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.05;
    reinforce(0.1, rng, rs);
    expect(poolCounts.units).toBe(30 + MOTHERSHIP_PAIR);
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
    spawnMotherships();
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    for (let i = 0; i < REINFORCE_UNIT_CAP; i++) {
      spawnAt(0, 0, i * 20, 0);
    }
    reinforce(0.1, rng, rs);
    // team0: 250体で cap 超え → スキップ, team1: 劣勢(ratio≈0.004)で2ウェーブ=24体(cnt<35で+1/wave@r=0.99)
    expect(poolCounts.units).toBe(REINFORCE_UNIT_CAP + 24 + MOTHERSHIP_PAIR);
  });

  it('両チーム同数の場合、両チームに均等にスポーンされる', () => {
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    let team0 = 0;
    let team1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (!unit(i).alive) {
        continue;
      }
      if (unit(i).team === 0) {
        team0++;
      } else {
        team1++;
      }
    }
    expect(team0).toBeGreaterThan(0);
    expect(team1).toBeGreaterThan(0);
    expect(team0).toBe(team1);
  });
});

describe('rubber band reinforcements', () => {
  /** 指定チームにn体のDroneを事前スポーンする */
  function prefillTeam(team: 0 | 1, count: number) {
    for (let i = 0; i < count; i++) {
      spawnAt(team, 0, i * 20, team * 500);
    }
  }

  /** チーム別のユニット数をカウント */
  function countByTeam(): [number, number] {
    let t0 = 0;
    let t1 = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      if (!unit(i).alive) {
        continue;
      }
      if (unit(i).team === 0) {
        t0++;
      } else {
        t1++;
      }
    }
    return [t0, t1];
  }

  it('優勢チーム (ratio >= RUBBER_BAND_RATIO) に増援なし', () => {
    spawnMotherships();
    // team0: 60体, team1: 40体 → ratio = 60/40 = 1.5 >= 1.3
    prefillTeam(0, 60);
    prefillTeam(1, 40);
    const before0 = 60;
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    const [after0, after1] = countByTeam();
    // team0 は増援スキップ（母艦分のみ）
    expect(after0).toBe(before0 + 1); // +1 = 母艦
    // team1 は増援あり
    expect(after1).toBeGreaterThan(40 + 1);
  });

  it('劣勢チーム (ratio <= 1/RUBBER_BAND_RATIO) に2ウェーブ', () => {
    spawnMotherships();
    // team0: 30体, team1: 60体 → ratio = 30/60 = 0.5 <= 0.77
    prefillTeam(0, 30);
    prefillTeam(1, 60);
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    const [after0] = countByTeam();
    // team0: 30 + 母艦1 + 2ウェーブ(各12体@r=0.99,cnt<35) = 30 + 1 + 24 = 55
    expect(after0).toBe(30 + 1 + 24);
  });

  it('均衡時 (1/RUBBER_BAND_RATIO < ratio < RUBBER_BAND_RATIO) は従来通り1ウェーブ', () => {
    spawnMotherships();
    // team0: 50体, team1: 50体 → ratio = 1.0
    prefillTeam(0, 50);
    prefillTeam(1, 50);
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    const [after0, after1] = countByTeam();
    // 各チーム: 50 + 母艦1 + 1ウェーブ(11体) = 62
    expect(after0).toBe(50 + 1 + 11);
    expect(after1).toBe(50 + 1 + 11);
  });

  it('圧倒的優勢 (相手が母艦のみ) → 優勢側スキップ、劣勢側に2ウェーブ', () => {
    spawnMotherships();
    // team0: 30+母艦1=31体, team1: 母艦1体 → ratio = 31/1 = 31 → 優勢スキップ
    prefillTeam(0, 30);
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    const [after0, after1] = countByTeam();
    // team0: 優勢スキップ（ratio = 31 >= RUBBER_BAND_RATIO）
    expect(after0).toBe(30 + 1); // +1 = 母艦
    // team1: enemyCnt(=31) > 0, ratio = 1/31 ≈ 0.03 → 劣勢で2ウェーブ
    expect(after1).toBeGreaterThan(1);
  });

  it('敵全滅 (enemyCnt === 0, 母艦復活不可) → 均衡扱いで通常1ウェーブ', () => {
    // プールをほぼ埋めて母艦復活用スロットがない状態を作る
    fillUnitPool();
    // team0 用にスロットを空ける（先頭の数体を kill して team0 のユニットとして再スポーン）
    const freeSlots = 20;
    for (let i = 0; i < freeSlots; i++) {
      unit(i).alive = false;
    }
    setUnitCount(POOL_UNITS - freeSlots);
    // team0 に数体スポーン
    const team0Count = 10;
    for (let i = 0; i < team0Count; i++) {
      spawnAt(0, 0, i * 20, 0);
    }
    // team1 は 0体、プール満杯で母艦復活もできない
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.99;
    reinforce(0.1, rng, rs);
    const [after0] = countByTeam();
    // enemyCnt=0 → ratio=1.0 (均衡) → 通常1ウェーブ (11体@r=0.99)
    // ただしプール空きスロット(20-10=10)が11体より少ないので、空きが埋まるだけ
    expect(after0).toBeGreaterThan(team0Count);
  });

  it(`RUBBER_BAND_RATIO は ${RUBBER_BAND_RATIO}`, () => {
    expect(RUBBER_BAND_RATIO).toBe(1.3);
  });
});

describe('REINFORCEMENT_TABLE — overlap snapshot', () => {
  const STEP = 0.001;
  const STEPS = Math.ceil(1 / STEP);
  const CNT = 0; // cnt<50/40 ゲートを通すため低い値

  /** 各エントリが true を返す r の集合をサンプリング */
  function sampleActive(): boolean[][] {
    const active: boolean[][] = [];
    for (const entry of REINFORCEMENT_TABLE) {
      const hits: boolean[] = [];
      for (let s = 0; s < STEPS; s++) {
        hits.push(entry.condition(s * STEP, CNT));
      }
      active.push(hits);
    }
    return active;
  }

  /** 2つの boolean 配列に同時 true が存在するか */
  function hasOverlap(a: boolean[], b: boolean[]): boolean {
    for (let s = 0; s < STEPS; s++) {
      if (a[s] && b[s]) {
        return true;
      }
    }
    return false;
  }

  /** エントリ index → ユニット名 */
  function entryName(idx: number): string {
    const entry = REINFORCEMENT_TABLE[idx];
    if (!entry) {
      return `idx${idx}`;
    }
    return TYPES[entry.type]?.name ?? `type${entry.type}`;
  }

  /** 全ペアの重複を検出 */
  function detectOverlaps(): string[] {
    const active = sampleActive();
    const pairs = collectPairs(active);
    return [...new Set(pairs)].sort();
  }

  /** active 配列からペアを収集 */
  function collectPairs(active: boolean[][]): string[] {
    const pairs: string[] = [];
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (hasOverlap(active[i] ?? [], active[j] ?? [])) {
          const sorted = [entryName(i), entryName(j)].sort();
          pairs.push(`${sorted[0]} × ${sorted[1]}`);
        }
      }
    }
    return pairs;
  }

  it('既知の重複ペアと一致（ユニット追加時はスナップショット更新）', () => {
    expect(detectOverlaps()).toEqual([
      'Amplifier × Bomber',
      'Amplifier × Disruptor',
      'Amplifier × Lancer',
      'Amplifier × Sniper',
      'Arcer × Bomber',
      'Arcer × Catalyst',
      'Bastion × Bomber',
      'Bastion × Disruptor',
      'Bastion × Reflector',
      'Bastion × Sniper',
      'Bomber × Bomber',
      'Bomber × Carrier',
      'Bomber × Catalyst',
      'Bomber × Cruiser',
      'Bomber × Disruptor',
      'Bomber × Flagship',
      'Bomber × Healer',
      'Bomber × Lancer',
      'Bomber × Launcher',
      'Bomber × Reflector',
      'Bomber × Scorcher',
      'Bomber × Scrambler',
      'Bomber × Sniper',
      'Bomber × Teleporter',
      'Carrier × Cruiser',
      'Carrier × Disruptor',
      'Carrier × Flagship',
      'Carrier × Scorcher',
      'Catalyst × Teleporter',
      'Cruiser × Disruptor',
      'Cruiser × Flagship',
      'Cruiser × Healer',
      'Cruiser × Launcher',
      'Cruiser × Reflector',
      'Cruiser × Scorcher',
      'Disruptor × Flagship',
      'Disruptor × Healer',
      'Disruptor × Launcher',
      'Disruptor × Reflector',
      'Disruptor × Scorcher',
      'Disruptor × Sniper',
      'Healer × Launcher',
      'Healer × Scorcher',
      'Lancer × Scrambler',
      'Launcher × Reflector',
    ]);
  });
});
