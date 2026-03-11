/**
 * CLI ユーティリティ — 引数パース汎用関数
 */

export function collectArgPairs(argv: readonly string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (let i = 0; i < argv.length - 1; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg?.startsWith('--') && next && !next.startsWith('--')) {
      pairs.set(arg, next);
      i++;
    }
  }
  return pairs;
}

export function parseIntArg(pairs: Map<string, string>, key: string, fallback: number): number {
  const v = pairs.get(key);
  if (v === undefined) {
    return fallback;
  }
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}
