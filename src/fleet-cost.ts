import type { UnitTypeIndex } from './types.ts';
import { TYPE_INDICES } from './unit-type-accessors.ts';
import { TYPES } from './unit-types.ts';

/** 購入可能なユニットタイプか（cost > 0 かつ clusterSize > 0） */
export function isPurchasable(typeIdx: UnitTypeIndex): boolean {
  const t = TYPES[typeIdx];
  return t !== undefined && t.cost > 0 && t.clusterSize > 0;
}

/** コスト昇順 → 同コストはTYPES配列順でソート。購入不可タイプは除外 */
export const SORTED_TYPE_INDICES: readonly UnitTypeIndex[] = TYPE_INDICES.filter((i) => isPurchasable(i)).sort(
  (a, b) => {
    const ca = TYPES[a]?.cost ?? 0;
    const cb = TYPES[b]?.cost ?? 0;
    return ca !== cb ? ca - cb : a - b;
  },
);
