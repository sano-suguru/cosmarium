import { describe, expect, it } from 'vitest';
import type { MeleeResult } from '../../melee-tracker.ts';
import type { Team } from '../../team.ts';
import { buildElimMap, buildMeleeRanking, compareMeleeTeams, computeMaxKills } from './melee-ranking.ts';

function makeStats(kills: number, survivors: number, initialUnits = 10) {
  return { kills, survivors, initialUnits } as const;
}

function makeMeleeResult(
  teamStats: readonly { kills: number; survivors: number; initialUnits: number }[],
  opts: { winnerTeam?: Team | null; elapsed?: number } = {},
): MeleeResult {
  return {
    winnerTeam: opts.winnerTeam ?? null,
    numTeams: teamStats.length,
    elapsed: opts.elapsed ?? 60,
    teamStats,
    eliminations: [],
  };
}

describe('buildElimMap', () => {
  it('空の配列から空 Map を返す', () => {
    expect(buildElimMap([])).toEqual(new Map());
  });

  it('elimination イベントを team → elapsed にマッピングする', () => {
    const events = [
      { team: 1 as Team, elapsed: 30 },
      { team: 3 as Team, elapsed: 55 },
    ];
    const map = buildElimMap(events);
    expect(map.get(1)).toBe(30);
    expect(map.get(3)).toBe(55);
    expect(map.size).toBe(2);
  });
});

describe('computeMaxKills', () => {
  it('全チームのキル数の最大値を返す', () => {
    const result = makeMeleeResult([makeStats(5, 2), makeStats(12, 0), makeStats(8, 1)]);
    expect(computeMaxKills(result)).toBe(12);
  });

  it('全チーム 0 キルなら 0 を返す', () => {
    const result = makeMeleeResult([makeStats(0, 5), makeStats(0, 3)]);
    expect(computeMaxKills(result)).toBe(0);
  });
});

describe('compareMeleeTeams', () => {
  it('生存チームが全滅チームより上位', () => {
    const result = makeMeleeResult([makeStats(3, 0), makeStats(5, 2)]);
    const elimMap = new Map<number, number>();
    expect(compareMeleeTeams(0, 1, result, elimMap)).toBeGreaterThan(0);
    expect(compareMeleeTeams(1, 0, result, elimMap)).toBeLessThan(0);
  });

  it('両方全滅の場合、後に全滅したチームが上位', () => {
    const result = makeMeleeResult([makeStats(5, 0), makeStats(3, 0)]);
    const elimMap = new Map([
      [0, 30],
      [1, 50],
    ]);
    // team 1 が後に全滅 → 上位
    expect(compareMeleeTeams(0, 1, result, elimMap)).toBeGreaterThan(0);
  });

  it('両方生存の場合、キル数が多いチームが上位', () => {
    const result = makeMeleeResult([makeStats(5, 2), makeStats(10, 3)]);
    const elimMap = new Map<number, number>();
    // team 1 のキルが多い → 上位
    expect(compareMeleeTeams(0, 1, result, elimMap)).toBeGreaterThan(0);
  });

  it('キル数も同じ場合、チームインデックスの昇順', () => {
    const result = makeMeleeResult([makeStats(5, 2), makeStats(5, 2)]);
    const elimMap = new Map<number, number>();
    expect(compareMeleeTeams(0, 1, result, elimMap)).toBeLessThan(0);
  });
});

describe('buildMeleeRanking', () => {
  it('チームを正しい順位でソートする', () => {
    const result = makeMeleeResult([makeStats(3, 0), makeStats(10, 4), makeStats(7, 0), makeStats(5, 1)]);
    const elimMap = new Map([
      [0, 20],
      [2, 40],
    ]);
    const ranking = buildMeleeRanking(result, elimMap);
    // 生存チーム（キル順）→ 全滅チーム（全滅時間遅い順）
    expect(ranking).toEqual([1, 3, 2, 0]);
  });

  it('1チームのみの場合そのまま返す', () => {
    const result = makeMeleeResult([makeStats(5, 3)]);
    const ranking = buildMeleeRanking(result, new Map());
    expect(ranking).toEqual([0]);
  });
});
