import type { UnitTypeIndex } from './types.ts';
import type { ProductionSlot } from './types-fleet.ts';
import { unitTypeCost } from './unit-type-accessors.ts';

/** 母艦あたりの生産スロット数 */
export const SLOT_COUNT = 5;

/** 1ティックあたりのチーム全体の最大クラスタースポーン回数（全スロット共有、バースト防止） */
export const MAX_CLUSTERS_PER_TICK = 5;

export function createProductionSlot(type: UnitTypeIndex, count: number): ProductionSlot {
  const cost = unitTypeCost(type);
  if (cost === 0) {
    throw new RangeError(`Cannot create production slot for zero-cost unit type ${type}`);
  }
  if (count <= 0) {
    throw new RangeError(`Cannot create production slot with non-positive count ${count} for unit type ${type}`);
  }
  return { type, count };
}

/**
 * ユニットタイプのコストとバリアント倍率から生産時間を算出する。
 * コスト比例の線形スケーリング: 高コストユニットほど生産に時間がかかる。
 * 例: Drone(cost=1) × Hive(mul=0.7) = 0.7秒、Fighter(cost=3) × Hive = 2.1秒
 * 最小値 0.1秒でクランプし、ゼロ除算を防止。
 */
export function getProductionTime(typeIdx: UnitTypeIndex, variantMul: number): number {
  return Math.max(0.1, unitTypeCost(typeIdx) * variantMul);
}

/** nullable スロット配列から有効なスロットのみを抽出する型安全ヘルパー */
export function filledSlots(slots: readonly (ProductionSlot | null)[]): ProductionSlot[] {
  return slots.filter((s): s is ProductionSlot => s !== null);
}
