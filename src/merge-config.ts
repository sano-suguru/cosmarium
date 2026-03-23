/** GDD §3-B レベル進行テーブル（totalUnits: 初期1体を含むマージ累計数） */
const LAST_LEVEL_ENTRY = { level: 3, totalUnits: 6 } as const;
const LEVELS_DESC = [LAST_LEVEL_ENTRY, { level: 2, totalUnits: 3 }] as const;

/** 最大マージレベル（★3） */
export const MAX_MERGE_LEVEL = LAST_LEVEL_ENTRY.level;

/** mergeExp の構造的上限（★3 到達値） */
export const MAX_MERGE_EXP = LAST_LEVEL_ENTRY.totalUnits - 1;

/** mergeExp 1あたりの HP/Damage ブースト率 */
export const MERGE_STAT_BONUS = 0.04;

/** mergeExp 1あたりの生産時間短縮率 */
export const MERGE_PRODUCTION_BONUS = 0.03;

/** mergeExp → 表示レベル (1, 2, 3) 変換 */
export function mergeExpToLevel(exp: number): number {
  for (const entry of LEVELS_DESC) {
    if (exp >= entry.totalUnits - 1) {
      return entry.level;
    }
  }
  return 1;
}

/** ボーナス段階 (0,1,2)。表示レベル (1,2,3) から 1 を引いた値 */
export function mergeBonusLevel(exp: number): number {
  return mergeExpToLevel(exp) - 1;
}
