import type { FleetComposition, UnitTypeIndex } from './types.ts';
import { TYPE_INDICES, TYPES } from './unit-types.ts';

/** プレイヤーの初期予算 */
export const DEFAULT_BUDGET = 200;

/** 購入可能なユニットタイプか（cost > 0） */
export function isPurchasable(typeIdx: number): boolean {
  return (TYPES[typeIdx]?.cost ?? 0) > 0;
}

/** コスト昇順 → 同コストはTYPES配列順でソート。購入不可タイプは除外 */
export const SORTED_TYPE_INDICES: readonly UnitTypeIndex[] = TYPE_INDICES.filter((i) => isPurchasable(i)).sort(
  (a, b) => {
    const ca = TYPES[a]?.cost ?? 0;
    const cb = TYPES[b]?.cost ?? 0;
    return ca !== cb ? ca - cb : a - b;
  },
);

export function countFleetUnits(fleet: FleetComposition): number {
  let n = 0;
  for (const e of fleet) {
    n += e.count;
  }
  return n;
}
