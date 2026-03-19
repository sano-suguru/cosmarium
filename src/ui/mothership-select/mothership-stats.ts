import type { MothershipDef } from '../../mothership-defs.ts';
import { getMothershipArmament } from '../../mothership-defs.ts';
import { MAX_SLOT_COUNT } from '../../production-config.ts';
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

type StatRule = (def: MothershipDef) => StatEntry | null;

function slotProductionMulRule(slotIdx: number): StatRule {
  return (d) => {
    const mul = d.slotProductionMuls?.[slotIdx];
    if (mul === undefined || mul === 1.0) {
      return null;
    }
    return { label: `スロット${slotIdx + 1}生産速度`, value: `×${mul}`, tone: mul > 1 ? 'buff' : 'debuff' };
  };
}

const STAT_RULES: readonly StatRule[] = [
  (d) =>
    d.slotCount !== 5
      ? { label: 'スロット数', value: String(d.slotCount), tone: d.slotCount > 5 ? 'buff' : 'debuff' }
      : null,
  (d) => (d.productionTimeMul !== 1.0 ? pctStat('生産速度', Math.round((1 - d.productionTimeMul) * 100)) : null),
  (d) => (d.spawnCountMul !== 1.0 ? pctStat('スポーン数', Math.round((d.spawnCountMul - 1) * 100)) : null),
  (d) => (d.unitHpMul !== 1.0 ? pctStat('ユニットHP', Math.round((d.unitHpMul - 1) * 100)) : null),
  (d) => (d.unitDmgMul !== 1.0 ? pctStat('ユニット攻撃力', Math.round((d.unitDmgMul - 1) * 100)) : null),
  ...Array.from({ length: MAX_SLOT_COUNT }, (_, i) => slotProductionMulRule(i)),
  (d) => (d.creditsPerRound > 0 ? { label: 'ラウンド追加Cr', value: `+${d.creditsPerRound}`, tone: 'buff' } : null),
  (d) => (d.freeRerolls > 0 ? { label: '無料リロール', value: `${d.freeRerolls}回/R`, tone: 'buff' } : null),
  (d) => (d.sellBonus > 0 ? { label: '売却ボーナス', value: `+${d.sellBonus}Cr`, tone: 'buff' } : null),
  (d) => (d.mothershipHpMul !== 1.0 ? pctStat('母艦HP', Math.round((d.mothershipHpMul - 1) * 100)) : null),
  (d) => (getMothershipArmament(d.type) !== null ? { label: '主砲', value: '搭載', tone: 'buff' } : null),
];

function collectRuleEntries(def: MothershipDef): StatEntry[] {
  const stats: StatEntry[] = [];
  for (const rule of STAT_RULES) {
    const entry = rule(def);
    if (entry) {
      stats.push(entry);
    }
  }
  return stats;
}

function hpTone(mul: number): StatEntry['tone'] {
  if (mul < 1.0) {
    return 'debuff';
  }
  return mul > 1.0 ? 'buff' : 'neutral';
}

export function buildMothershipStats(def: MothershipDef): readonly StatEntry[] {
  const stats = collectRuleEntries(def);
  const baseHp = unitType(def.type).hp;
  const effectiveHp = def.mothershipHpMul !== 1.0 ? Math.round(baseHp * def.mothershipHpMul) : baseHp;
  stats.push({ label: 'HP', value: String(effectiveHp), tone: hpTone(def.mothershipHpMul) });
  return stats;
}
