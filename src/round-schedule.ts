import type { RoundScheduleEntry } from './types-fleet.ts';

/** ラウンド番号からラウンドタイプを決定する */
export function scheduleRound(round: number): RoundScheduleEntry {
  if (round < 1) {
    throw new Error(`scheduleRound: invalid round ${round}`);
  }
  if (round % 5 === 0) {
    return { roundType: 'ffa', preview: true };
  }
  if (round >= 3 && round % 5 === 3) {
    return { roundType: 'bonus', preview: true };
  }
  return { roundType: 'battle', preview: false };
}
