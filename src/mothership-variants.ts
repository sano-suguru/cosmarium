import type { Armament } from './types.ts';
import type { MothershipVariant, MothershipVariantOrNone } from './types-fleet.ts';
import { NO_VARIANT } from './types-fleet.ts';

interface MothershipVariantDefBase {
  readonly id: MothershipVariantOrNone;
  readonly name: string;
  readonly description: string;
  /** 生産間隔倍率（低い＝速い） */
  readonly productionRateMul: number;
  /** 味方の通常射撃クールダウン倍率（高い＝回転速い）。abilityCooldown には適用しない */
  readonly attackCdMul: number;
  /** 母艦HP倍率 */
  readonly hpMul: number;
  /** 搭載主砲（null＝なし） */
  readonly armament: Armament | null;
}

/** 選択可能なバリアント定義（id は MothershipVariant） */
interface MothershipVariantDef extends MothershipVariantDefBase {
  readonly id: MothershipVariant;
}

const HIVE: MothershipVariantDef = {
  id: 0,
  name: 'ハイブ',
  description: '生産速度が30%向上する',
  productionRateMul: 0.7,
  attackCdMul: 1.0,
  hpMul: 1.0,
  armament: null,
};

const DREADNOUGHT: MothershipVariantDef = {
  id: 1,
  name: 'ドレッドノート',
  description: '重装甲＋遠距離主砲を搭載',
  productionRateMul: 1.3,
  attackCdMul: 1.0,
  hpMul: 1.5,
  armament: { fireRate: 3.0, damage: 15, range: 500 },
};

const REACTOR: MothershipVariantDef = {
  id: 2,
  name: 'リアクター',
  description: '味方全体の攻撃速度が25%向上',
  productionRateMul: 1.0,
  attackCdMul: 1.25,
  hpMul: 0.7,
  armament: null,
};

export const MOTHERSHIP_VARIANTS: readonly [MothershipVariantDef, MothershipVariantDef, MothershipVariantDef] = [
  HIVE,
  DREADNOUGHT,
  REACTOR,
];

/** ニュートラルデフォルト: 全倍率 1.0。NO_VARIANT 時のフォールバック用 */
const NEUTRAL_DEF: MothershipVariantDefBase = {
  id: NO_VARIANT,
  name: '',
  description: '',
  attackCdMul: 1.0,
  productionRateMul: 1.0,
  hpMul: 1.0,
  armament: null,
};

export function getVariantDef(v: MothershipVariantOrNone): MothershipVariantDefBase {
  if (v >= 0 && v < MOTHERSHIP_VARIANTS.length) {
    // v は MothershipVariant（0 | 1 | 2）に絞られるが、noUncheckedIndexedAccess のため明示キャスト
    return MOTHERSHIP_VARIANTS[v as MothershipVariant];
  }
  return NEUTRAL_DEF;
}

// MothershipVariant 型と MOTHERSHIP_VARIANTS 配列長の同期を検証（不一致時はコンパイルエラー）
type _Indices<N extends number, A extends number[] = []> = A['length'] extends N
  ? A[number]
  : _Indices<N, [...A, A['length']]>;
type _ExpectedVariant = _Indices<(typeof MOTHERSHIP_VARIANTS)['length']>;
type _Assert<T extends true> = T;
// @ts-expect-error unused type alias for compile-time assertion
type _CheckVariantSync = _Assert<
  [_ExpectedVariant] extends [MothershipVariant]
    ? [MothershipVariant] extends [_ExpectedVariant]
      ? true
      : false
    : false
>;
