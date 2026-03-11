/**
 * バッチ対戦システム — CLI出力フォーマット
 */

import { unitTypeName } from '../unit-type-accessors.ts';
import type { BatchSummary, KillMatrix, TrialResult, UnitTypeSummary } from './batch-types.ts';
import { typeName } from './batch-types.ts';

function winLabel(winner: number | 'draw' | null): string {
  if (winner === null) {
    return '時間切';
  }
  if (winner === 'draw') {
    return '引分';
  }
  return `チーム${winner}勝利`;
}

function formatTrialLine(trial: TrialResult): string[] {
  const divStr = trial.fleetDiversities.length > 0 ? trial.fleetDiversities.map((d) => d.toFixed(3)).join('/') : '-';
  const fleetStr = trial.fleetCompositions
    .map((f, i) => `T${i}[${f.map((e) => `${unitTypeName(e.type)}:${e.count}`).join(',')}]`)
    .join(' vs ');
  return [
    `  #${String(trial.trialIndex).padStart(3, '0')} | ${winLabel(trial.winner).padEnd(10)} | ${trial.steps.toString().padStart(5)}歩 | 複雑性=${trial.complexity.toFixed(3)} | 多様性=${divStr}`,
    `         ${fleetStr}`,
  ];
}

interface BalanceCandidate {
  readonly name: string;
  readonly tag: 'OP' | 'UP';
  readonly kd: number;
  readonly winRate: number;
  readonly winDelta: number;
}

function detectBalanceCandidates(unitSummary: readonly UnitTypeSummary[]): BalanceCandidate[] {
  const candidates: BalanceCandidate[] = [];

  for (const us of unitSummary) {
    if (us.totalSpawned === 0) {
      continue;
    }
    if (us.winDelta > 0.1) {
      candidates.push({ name: us.name, tag: 'OP', kd: us.kd, winRate: us.winRateWhenPresent, winDelta: us.winDelta });
    } else if (us.winDelta < -0.1) {
      candidates.push({ name: us.name, tag: 'UP', kd: us.kd, winRate: us.winRateWhenPresent, winDelta: us.winDelta });
    }
  }

  return candidates;
}

function pctOrDash(value: number): string {
  return value > 0 ? `${(value * 100).toFixed(1)}%` : '  -  ';
}

function formatUnitRow(us: UnitTypeSummary): string {
  const name = us.name.padEnd(16);
  const spawned = String(us.totalSpawned).padStart(5);
  const kills = String(us.totalKills).padStart(5);
  const deaths = String(us.totalDeaths).padStart(5);
  const kd = (us.kd === Number.POSITIVE_INFINITY ? '  ∞ ' : us.kd.toFixed(2)).padStart(5);
  const sr = us.totalSpawned > 0 ? pctOrDash(us.survivalRate) : '  -  ';
  const cost = String(us.cost).padStart(6);
  const kpc = us.killsPerCost > 0 ? us.killsPerCost.toFixed(3) : '  -  ';
  const wrP = pctOrDash(us.winRateWhenPresent);
  const wrA = pctOrDash(us.winRateWhenAbsent);
  const wd = `${us.winDelta >= 0 ? '+' : ''}${(us.winDelta * 100).toFixed(1)}%`;
  return `  ${name}| ${spawned} | ${kills} | ${deaths} | ${kd} | ${sr.padStart(6)} | ${cost} | ${kpc.padStart(8)} | ${wrP.padStart(8)} | ${wrA.padStart(6)} | ${wd.padStart(6)}`;
}

function formatBalanceCandidates(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const candidates = detectBalanceCandidates(unitSummary);
  if (candidates.length > 0) {
    lines.push('');
    lines.push('  --- バランス候補 ---');
    for (const c of candidates) {
      const tag = c.tag === 'OP' ? '[OP] OP候補' : '[UP] UP候補';
      const delta = `${c.winDelta >= 0 ? '+' : ''}${(c.winDelta * 100).toFixed(1)}%`;
      lines.push(
        `  ${tag}: ${c.name} (貢献度=${delta}, K/D=${c.kd.toFixed(2)}, 勝率=${(c.winRate * 100).toFixed(1)}%)`,
      );
    }
  }
  return lines;
}

function formatUnitTable(unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push('===============================================');
  lines.push('  ユニットタイプ別戦績 (K/D降順)');
  lines.push('===============================================');
  lines.push(
    '  ユニット        | 出撃  | キル  | デス  |  K/D  | 生存率 | コスト | K/コスト | 勝率(含) | 勝率(除) | 貢献度',
  );
  lines.push(
    '  ----------------|-------|-------|-------|-------|--------|--------|----------|----------|----------|-------',
  );
  for (const us of unitSummary) {
    lines.push(formatUnitRow(us));
  }
  lines.push(...formatBalanceCandidates(unitSummary));
  return lines;
}

// ─── Kill Matrix ─────────────────────────────────────────────────

function collectKillPairs(
  matrix: KillMatrix,
  activeTypes: readonly UnitTypeSummary[],
): { killer: string; victim: string; count: number }[] {
  const pairs: { killer: string; victim: string; count: number }[] = [];
  for (const k of activeTypes) {
    const row = matrix.data[k.typeIndex];
    if (!row) {
      continue;
    }
    for (const v of activeTypes) {
      const count = row[v.typeIndex] ?? 0;
      if (count > 0) {
        pairs.push({ killer: k.name, victim: v.name, count });
      }
    }
  }
  pairs.sort((a, b) => b.count - a.count);
  return pairs;
}

function typeNameOrDash(typeIdx: number | null): string {
  if (typeIdx === null) {
    return '-';
  }
  return typeName(typeIdx);
}

function formatKillMatrix(matrix: KillMatrix, unitSummary: readonly UnitTypeSummary[]): string[] {
  const lines: string[] = [];
  const activeTypes = unitSummary.filter((us) => us.totalSpawned > 0 || us.totalKills > 0);
  if (activeTypes.length === 0) {
    return lines;
  }

  const pairs = collectKillPairs(matrix, activeTypes);

  lines.push('');
  lines.push('===============================================');
  lines.push('  キルマトリクス (上位20組)');
  lines.push('===============================================');
  lines.push('  攻撃者          → 被害者          | キル数');
  lines.push('  ----------------|-----------------|-------');
  for (const p of pairs.slice(0, 20)) {
    lines.push(`  ${p.killer.padEnd(16)} → ${p.victim.padEnd(16)}| ${String(p.count).padStart(5)}`);
  }

  lines.push('');
  lines.push('  --- 得意/苦手マッチアップ ---');
  for (const us of activeTypes) {
    const victim = typeNameOrDash(us.topVictimType);
    const threat = typeNameOrDash(us.topThreatType);
    lines.push(`  ${us.name.padEnd(16)}: 得意=${victim.padEnd(12)} 苦手=${threat}`);
  }

  return lines;
}

import {
  formatDamageTable,
  formatKillContextTable,
  formatLifespanTable,
  formatSupportTable,
  formatSynergyTable,
} from './batch-format-stats.ts';

// ─── Main Format ─────────────────────────────────────────────────

export function formatSummary(summary: BatchSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('===============================================');
  lines.push('  COSMARIUM バッチ対戦分析');
  lines.push('===============================================');
  lines.push(`  モード: ${summary.config.mode} | 試合数: ${summary.config.trials}`);
  lines.push(`  シード: ${summary.config.seed} | 最大ステップ: ${summary.config.maxSteps}`);
  lines.push('-----------------------------------------------');
  lines.push(`  平均ステップ数:       ${summary.stats.avgSteps.toFixed(1)}`);
  lines.push(`  平均複雑性スコア:     ${summary.stats.avgComplexity.toFixed(4)}`);
  lines.push(`  平均空間エントロピー: ${summary.stats.avgSpatialEntropy.toFixed(4)}`);
  lines.push(`  平均キルシーケンスエントロピー: ${summary.stats.avgKillSequenceEntropy.toFixed(4)}`);
  lines.push('-----------------------------------------------');
  lines.push('  勝率:');
  const OUTCOME_LABELS: Record<string, string | undefined> = { draw: '引分', timeout: '時間切' };
  for (const [key, rate] of Object.entries(summary.stats.winRates)) {
    const label = OUTCOME_LABELS[key] ?? `チーム${key}`;
    lines.push(`    ${label}: ${(rate * 100).toFixed(1)}%`);
  }
  lines.push('-----------------------------------------------');

  for (const trial of summary.trials) {
    lines.push(...formatTrialLine(trial));
  }

  if (summary.unitSummary.length > 0) {
    lines.push(...formatUnitTable(summary.unitSummary));
    lines.push(...formatKillMatrix(summary.killMatrix, summary.unitSummary));
    lines.push(...formatDamageTable(summary.unitSummary));
    lines.push(...formatSupportTable(summary.unitSummary));
    lines.push(...formatLifespanTable(summary.unitSummary));
    lines.push(...formatKillContextTable(summary.unitSummary));
  }
  if (summary.synergyPairs.length > 0) {
    lines.push(...formatSynergyTable(summary.synergyPairs));
  }

  lines.push('===============================================');
  return lines.join('\n');
}
