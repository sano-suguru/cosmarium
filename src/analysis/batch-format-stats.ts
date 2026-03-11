/**
 * バッチ対戦システム — 統計テーブルフォーマッタ
 */

import { KILL_CONTEXT_LABEL_LIST } from '../simulation/on-kill-effects.ts';
import type { SynergyPair, UnitTypeSummary } from './batch-types.ts';

// ─── Damage Table ────────────────────────────────────────────────

export function formatDamageTable(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const active = unitSummary.filter((us) => us.totalDamageDealt > 0 || us.totalDamageReceived > 0);
  if (active.length === 0) {
    return lines;
  }

  const sorted = [...active].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);

  lines.push('');
  lines.push('===============================================');
  lines.push('  ダメージ統計 (与ダメ降順)');
  lines.push('===============================================');
  lines.push('  ユニット        | 与ダメージ | 被ダメージ | ダメ/コスト');
  lines.push('  ----------------|------------|------------|------------');
  for (const us of sorted) {
    const name = us.name.padEnd(16);
    const dealt = us.totalDamageDealt.toFixed(0).padStart(10);
    const received = us.totalDamageReceived.toFixed(0).padStart(10);
    const dpc = us.damagePerCost > 0 ? us.damagePerCost.toFixed(2).padStart(10) : '     -    ';
    lines.push(`  ${name}| ${dealt} | ${received} | ${dpc}`);
  }

  return lines;
}

// ─── Support Table ───────────────────────────────────────────────

export function formatSupportTable(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const active = unitSummary.filter((us) => us.totalHealing > 0 || us.supportScore > 0);
  if (active.length === 0) {
    return lines;
  }

  const sorted = [...active].sort((a, b) => b.supportScore - a.supportScore);

  lines.push('');
  lines.push('===============================================');
  lines.push('  サポート効果統計');
  lines.push('===============================================');
  lines.push('  ユニット        | 回復量     | スコア');
  lines.push('  ----------------|------------|-------');
  for (const us of sorted) {
    const name = us.name.padEnd(16);
    const heal = us.totalHealing > 0 ? us.totalHealing.toFixed(0).padStart(10) : '     -    ';
    const score = us.supportScore.toFixed(0).padStart(5);
    lines.push(`  ${name}| ${heal} | ${score}`);
  }

  return lines;
}

// ─── Lifespan Table ──────────────────────────────────────────────

export function formatLifespanTable(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const active = unitSummary.filter((us) => us.avgLifespan > 0);
  if (active.length === 0) {
    return lines;
  }

  const sorted = [...active].sort((a, b) => b.avgLifespan - a.avgLifespan);

  lines.push('');
  lines.push('===============================================');
  lines.push('  生存時間分布 (平均生存時間降順)');
  lines.push('===============================================');
  lines.push('  ユニット        | 平均生存(秒)');
  lines.push('  ----------------|-------------');
  for (const us of sorted) {
    const name = us.name.padEnd(16);
    const lifespan = us.avgLifespan.toFixed(2).padStart(11);
    lines.push(`  ${name}| ${lifespan}`);
  }

  return lines;
}

// ─── Kill Context Table ─────────────────────────────────────────

export function formatKillContextTable(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const active = unitSummary.filter((us) => {
    let total = 0;
    for (const c of us.deathsByContext) {
      total += c;
    }
    return total > 0;
  });
  if (active.length === 0) {
    return lines;
  }

  lines.push('');
  lines.push('===============================================');
  lines.push('  死因内訳 (ダメージ種別)');
  lines.push('===============================================');
  lines.push(`  ユニット        | ${KILL_CONTEXT_LABEL_LIST.map((l) => l.padStart(6)).join(' | ')}`);
  lines.push(`  ----------------|${KILL_CONTEXT_LABEL_LIST.map(() => '--------').join('|')}`);
  for (const us of active) {
    const name = us.name.padEnd(16);
    const counts = Array.from(us.deathsByContext, (c) => String(c).padStart(6)).join(' | ');
    lines.push(`  ${name}| ${counts}`);
  }

  return lines;
}

// ─── Synergy Table ──────────────────────────────────────────────

export function formatSynergyTable(synergyPairs: readonly SynergyPair[]): string[] {
  const lines: string[] = [];
  if (synergyPairs.length === 0) {
    return lines;
  }

  lines.push('');
  lines.push('===============================================');
  lines.push('  混成艦隊シナジー分析');
  lines.push('===============================================');
  lines.push('  ペア                          | ペア勝率 | A単独  | B単独  | シナジー | 共起数');
  lines.push('  ------------------------------|----------|--------|--------|----------|------');

  const top = synergyPairs.slice(0, 15);
  for (const sp of top) {
    const pair = `${sp.nameA}+${sp.nameB}`.padEnd(30);
    const co = `${(sp.coWinRate * 100).toFixed(1)}%`.padStart(7);
    const soloA = `${(sp.soloAWinRate * 100).toFixed(1)}%`.padStart(6);
    const soloB = `${(sp.soloBWinRate * 100).toFixed(1)}%`.padStart(6);
    const syn = `${sp.synergy >= 0 ? '+' : ''}${(sp.synergy * 100).toFixed(1)}%`.padStart(8);
    const cnt = String(sp.coCount).padStart(4);
    lines.push(`  ${pair}| ${co} | ${soloA} | ${soloB} | ${syn} | ${cnt}`);
  }

  return lines;
}
