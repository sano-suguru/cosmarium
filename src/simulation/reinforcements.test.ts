import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { incMotherships, poolCounts, unit } from '../pools.ts';
import { rng, state } from '../state.ts';
import { TYPES, unitTypeIndex } from '../unit-types.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { REINFORCE_INTERVAL, REINFORCE_UNIT_CAP, REINFORCEMENT_TABLE, reinforce } from './reinforcements.ts';

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
    expect(poolCounts.units).toBe(22 + MOTHERSHIP_PAIR);
  });

  it('r < 0.1 かつ cnt < 50 で Flagship がスポーンする', () => {
    spawnMotherships();
    const rs = makeRS(REINFORCE_INTERVAL);
    state.rng = () => 0.05;
    reinforce(0.1, rng, rs);
    expect(poolCounts.units).toBe(28 + MOTHERSHIP_PAIR);
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
    expect(poolCounts.units).toBe(REINFORCE_UNIT_CAP + 11 + MOTHERSHIP_PAIR);
  });

  it('両チーム (0, 1) にそれぞれスポーンされる', () => {
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
      'Amplifier × Lancer',
      'Amplifier × Sniper',
      'Arcer × Catalyst',
      'Bastion × Bomber',
      'Bastion × Reflector',
      'Bastion × Sniper',
      'Bomber × Carrier',
      'Bomber × Cruiser',
      'Bomber × Flagship',
      'Bomber × Healer',
      'Bomber × Launcher',
      'Bomber × Reflector',
      'Bomber × Scorcher',
      'Carrier × Cruiser',
      'Carrier × Flagship',
      'Carrier × Scorcher',
      'Catalyst × Teleporter',
      'Cruiser × Flagship',
      'Cruiser × Healer',
      'Cruiser × Launcher',
      'Cruiser × Reflector',
      'Cruiser × Scorcher',
      'Healer × Launcher',
      'Healer × Scorcher',
      'Lancer × Scrambler',
      'Launcher × Reflector',
    ]);
  });
});
