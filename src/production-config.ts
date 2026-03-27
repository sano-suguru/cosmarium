import { MAX_MERGE_EXP, MERGE_PRODUCTION_BONUS } from './merge-config.ts';
import type { ModuleId, UnitTypeIndex } from './types.ts';
import { NO_MODULE } from './types.ts';
import type { ProductionSlot } from './types-fleet.ts';
import { unitTypeCost } from './unit-type-accessors.ts';

export const DEFAULT_SLOT_COUNT = 5;

/** 最大スロット数（Carrier Bay の上限） */
export const MAX_SLOT_COUNT = 7;

/** 1ティックあたりのチーム全体の最大クラスタースポーン回数（全スロット共有、バースト防止） */
export const MAX_CLUSTERS_PER_TICK = 5;

export function createProductionSlot(
  type: UnitTypeIndex,
  count: number,
  mergeExp: number,
  moduleId: ModuleId = NO_MODULE,
): ProductionSlot {
  const cost = unitTypeCost(type);
  if (cost === 0) {
    throw new RangeError(`Cannot create production slot for zero-cost unit type ${type}`);
  }
  if (count <= 0) {
    throw new RangeError(`Cannot create production slot with non-positive count ${count} for unit type ${type}`);
  }
  if (mergeExp < 0) {
    throw new RangeError(`Cannot create production slot with negative mergeExp ${mergeExp} for unit type ${type}`);
  }
  if (mergeExp > MAX_MERGE_EXP) {
    throw new RangeError(`mergeExp ${mergeExp} exceeds MAX_MERGE_EXP ${MAX_MERGE_EXP} for unit type ${type}`);
  }
  return { type, count, mergeExp, moduleId };
}

/**
 * ユニットタイプのコストとバリアント倍率から生産時間を算出する。
 * コスト比例の線形スケーリング: 高コストユニットほど生産に時間がかかる。
 * 例: Drone(cost=1) × Hive(mul=0.7) = 0.7秒、Fighter(cost=3) × Hive = 2.1秒
 * 最小値 0.1秒でクランプし、ゼロ除算を防止。
 */
export function getProductionTime(typeIdx: UnitTypeIndex, productionMul: number, mergeExp: number): number {
  return Math.max(0.1, (unitTypeCost(typeIdx) * productionMul) / (1 + mergeExp * MERGE_PRODUCTION_BONUS));
}

/** nullable スロット配列から有効なスロットのみを抽出する型安全ヘルパー */
export function filledSlots(slots: readonly (ProductionSlot | null)[]): ProductionSlot[] {
  return slots.filter((s): s is ProductionSlot => s !== null);
}
