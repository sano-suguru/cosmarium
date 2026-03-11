/**
 * ラウンドロビントーナメント — フォーマット・CLI ヘルパー
 */

import type { RoundRobinConfig, RoundRobinSummary } from './batch-types.ts';
import { collectArgPairs, parseIntArg } from './cli-utils.ts';

export function formatRoundRobin(summary: RoundRobinSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('===============================================');
  lines.push('  COSMARIUM ラウンドロビントーナメント');
  lines.push('===============================================');
  lines.push(`  コスト上限: ${summary.costCap} | 試行/組: ${summary.trialsPerMatchup} | シード: ${summary.seed}`);
  lines.push(`  対戦組数: ${summary.matchups.length}`);
  lines.push('');
  lines.push('  --- 勝率ランキング ---');
  lines.push('  ユニット        | 勝率   | 勝  | 負  | 分  | 得意な相手              | 苦手な相手');
  lines.push('  ----------------|--------|-----|-----|-----|-------------------------|-------------------------');

  for (const r of summary.rankings) {
    const name = r.name.padEnd(16);
    const wr = `${(r.winRate * 100).toFixed(1)}%`.padStart(6);
    const w = String(r.totalWins).padStart(3);
    const l = String(r.totalLosses).padStart(3);
    const d = String(r.totalDraws).padStart(3);
    const strong = r.strongAgainst.length > 0 ? r.strongAgainst.join(', ') : '-';
    const weak = r.weakAgainst.length > 0 ? r.weakAgainst.join(', ') : '-';
    lines.push(`  ${name}| ${wr} | ${w} | ${l} | ${d} | ${strong.padEnd(23)} | ${weak}`);
  }

  lines.push('===============================================');
  return lines.join('\n');
}

export function parseRoundRobinArgs(
  argv: readonly string[],
  createRng: (seed: number) => () => number,
): RoundRobinConfig {
  const pairs = collectArgPairs(argv);

  return {
    costCap: parseIntArg(pairs, '--cost-cap', 30),
    trials: parseIntArg(pairs, '--trials', 10),
    seed: parseIntArg(pairs, '--seed', 42),
    maxSteps: parseIntArg(pairs, '--maxSteps', 10800),
    outFile: pairs.get('--out') ?? null,
    createRng,
  };
}
