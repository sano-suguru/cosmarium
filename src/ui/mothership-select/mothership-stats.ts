import type { MothershipDef } from '../../mothership-defs.ts';
import { getMothershipArmament } from '../../mothership-defs.ts';
import { unitType } from '../../unit-type-accessors.ts';

type StatEntry = {
  readonly label: string;
  readonly value: string;
  readonly tone: 'buff' | 'debuff' | 'neutral';
};

function pctStat(label: string, pct: number): StatEntry {
  return {
    label,
    value: pct > 0 ? `+${pct}%` : `${pct}%`,
    tone: pct > 0 ? 'buff' : 'debuff',
  };
}

export function buildMothershipStats(def: MothershipDef): readonly StatEntry[] {
  const stats: StatEntry[] = [];

  if (def.productionTimeMul !== 1.0) {
    stats.push(pctStat('生産速度', Math.round((1 - def.productionTimeMul) * 100)));
  }
  if (def.spawnCountMul !== 1.0) {
    stats.push(pctStat('スポーン数', Math.round((def.spawnCountMul - 1) * 100)));
  }
  if (def.creditsPerRound > 0) {
    stats.push({ label: 'ラウンド追加Cr', value: `+${def.creditsPerRound}`, tone: 'buff' });
  }
  if (getMothershipArmament(def.type) !== null) {
    stats.push({ label: '主砲', value: '搭載', tone: 'buff' });
  }

  stats.push({ label: 'HP', value: String(unitType(def.type).hp), tone: 'neutral' });
  return stats;
}
