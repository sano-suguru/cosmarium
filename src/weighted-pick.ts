/**
 * 累積重みで候補からランダムに1件選択し、そのインデックスを返す。
 * totalW <= 0 の場合は不変条件違反として throw する。
 */
export function weightedPick(candidates: readonly { weight: number }[], rng: () => number): number {
  let totalW = 0;
  for (const c of candidates) {
    totalW += c.weight;
  }
  if (totalW <= 0) {
    throw new Error(`weightedPick: totalW must be > 0 (got ${totalW}, ${candidates.length} candidates)`);
  }
  let r = rng() * totalW;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c) {
      r -= c.weight;
      if (r < 0) {
        return i;
      }
    }
  }
  return Math.max(0, candidates.length - 1);
}
