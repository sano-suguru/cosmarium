import type { EliminationEvent, MeleeResult } from '../../melee-tracker.ts';
import type { Team } from '../../types.ts';
import { TEAMS } from '../../types.ts';

export function compareMeleeTeams(a: Team, b: Team, result: MeleeResult, elimMap: Map<number, number>): number {
  const sa = result.teamStats[a];
  const sb = result.teamStats[b];
  if (!sa || !sb) {
    return 0;
  }
  const aAlive = sa.survivors > 0;
  const bAlive = sb.survivors > 0;
  if (aAlive !== bAlive) {
    return aAlive ? -1 : 1;
  }
  if (!aAlive) {
    const diff = (elimMap.get(b) ?? 0) - (elimMap.get(a) ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  const killDiff = sb.kills - sa.kills;
  if (killDiff !== 0) {
    return killDiff;
  }
  return a - b;
}

export function buildMeleeRanking(result: MeleeResult, elimMap: Map<number, number>): Team[] {
  const ranking: Team[] = [];
  for (let i = 0; i < result.numTeams; i++) {
    const team = TEAMS[i];
    if (team !== undefined) {
      ranking.push(team);
    }
  }
  ranking.sort((a, b) => compareMeleeTeams(a, b, result, elimMap));
  return ranking;
}

export function computeMaxKills(result: MeleeResult): number {
  let max = 0;
  for (let i = 0; i < result.numTeams; i++) {
    const s = result.teamStats[i];
    if (s && s.kills > max) {
      max = s.kills;
    }
  }
  return max;
}

export function buildElimMap(eliminations: readonly EliminationEvent[]): Map<number, number> {
  const elimMap = new Map<number, number>();
  for (const ev of eliminations) {
    elimMap.set(ev.team, ev.elapsed);
  }
  return elimMap;
}
