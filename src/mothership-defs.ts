import type { Armament, UnitTypeIndex } from './types.ts';
import { NO_TYPE } from './types.ts';
import type { FleetSetup } from './types-fleet.ts';
import { DREADNOUGHT_TYPE, HIVE_TYPE, REACTOR_TYPE, unitType } from './unit-type-accessors.ts';
import { NO_FIRE } from './unit-type-resolve.ts';

interface MothershipDef {
  readonly type: UnitTypeIndex;
  readonly name: string;
  readonly description: string;
  /** 生産間隔倍率（低い＝速い） */
  readonly productionRateMul: number;
  /** 味方の通常射撃クールダウン倍率（高い＝回転速い）。abilityCooldown には適用しない */
  readonly attackCdMul: number;
}

const HIVE_DEF: MothershipDef = {
  type: HIVE_TYPE,
  name: 'Hive',
  description: '生産速度が30%向上する',
  productionRateMul: 0.7,
  attackCdMul: 1.0,
};

const DREADNOUGHT_DEF: MothershipDef = {
  type: DREADNOUGHT_TYPE,
  name: 'Dreadnought',
  description: '重装甲＋遠距離主砲を搭載',
  productionRateMul: 1.3,
  attackCdMul: 1.0,
};

const REACTOR_DEF: MothershipDef = {
  type: REACTOR_TYPE,
  name: 'Reactor',
  description: '味方全体の攻撃速度が25%向上',
  productionRateMul: 1.0,
  attackCdMul: 1.25,
};

/** UI セレクタ用の母艦定義リスト */
export const MOTHERSHIP_DEFS: readonly [MothershipDef, MothershipDef, MothershipDef] = [
  HIVE_DEF,
  DREADNOUGHT_DEF,
  REACTOR_DEF,
];

const _defsByType = new Map<number, MothershipDef>(MOTHERSHIP_DEFS.map((d) => [d.type, d]));

/** ニュートラルデフォルト: 全倍率 1.0。母艦撃沈後のフォールバック用 */
const NEUTRAL_DEF: MothershipDef = {
  type: NO_TYPE,
  name: '',
  description: '',
  attackCdMul: 1.0,
  productionRateMul: 1.0,
};

/**
 * 母艦タイプから MothershipDef を取得。
 * NO_TYPE（母艦未配備/撃沈後）の場合はニュートラルデフォルトを返す。
 */
export function getMothershipDef(t: UnitTypeIndex): MothershipDef {
  return _defsByType.get(t) ?? NEUTRAL_DEF;
}

/**
 * UnitType の武装パラメータから母艦用 Armament を構築する。
 * fireRate が NO_FIRE（非武装）の場合は null を返す。
 */
export function getMothershipArmament(t: UnitTypeIndex): Armament | null {
  if (t === NO_TYPE) {
    return null;
  }
  const ut = unitType(t);
  if (ut.fireRate >= NO_FIRE) {
    return null;
  }
  return { fireRate: ut.fireRate, damage: ut.damage, range: ut.range };
}

export const EMPTY_FLEET_SETUP: FleetSetup = { mothershipType: HIVE_TYPE, slots: [] };

// 起動時検証: 全母艦タイプの role が 'mothership' であることを保証
for (const def of MOTHERSHIP_DEFS) {
  if (unitType(def.type).role !== 'mothership') {
    throw new Error(`MothershipDef type mismatch: ${def.name} (type=${def.type}) must have role=mothership`);
  }
}
