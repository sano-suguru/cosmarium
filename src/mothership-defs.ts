import { MAX_SLOT_COUNT } from './production-config.ts';
import type { Armament, UnitTypeIndex } from './types.ts';
import { NO_TYPE } from './types.ts';
import type { FleetSetup } from './types-fleet.ts';
import {
  ACCELERATOR_TYPE,
  BLOODBORNE_TYPE,
  CARRIER_BAY_TYPE,
  COLOSSUS_TYPE,
  DREADNOUGHT_TYPE,
  HIVE_TYPE,
  REACTOR_TYPE,
  SYNDICATE_TYPE,
  unitType,
} from './unit-type-accessors.ts';
import { NO_FIRE } from './unit-type-resolve.ts';

export interface MothershipDef {
  readonly type: UnitTypeIndex;
  readonly name: string;
  readonly description: string;
  /** 生産間隔倍率（0.7 = 30%高速, 1.3 = 30%低速） */
  readonly productionTimeMul: number;
  /** 味方の通常射撃クールダウン倍率（高い＝回転速い）。abilityCooldown には適用しない */
  readonly attackCdMul: number;
  readonly spawnCountMul: number;
  readonly creditsPerRound: number;
  /** Bot 母艦選択の重み [early, mid, late]。[0,0,0] = Bot 候補外 */
  readonly botWeights: readonly [early: number, mid: number, late: number];
  readonly slotCount: number;
  readonly unitHpMul: number;
  readonly unitDmgMul: number;
  /** スロット別生産速度倍率。slotProductionMuls[i] > 1 = そのスロットの生産が速い */
  readonly slotProductionMuls?: readonly number[];
  /** 無料リロール回数/ラウンド */
  readonly freeRerolls: number;
  /** 売却追加Cr */
  readonly sellBonus: number;
  /** 母艦HP倍率。スポーン後に適用 */
  readonly mothershipHpMul: number;
}

const MS_DEFAULTS = {
  productionTimeMul: 1.0,
  attackCdMul: 1.0,
  spawnCountMul: 1.0,
  creditsPerRound: 0,
  slotCount: 5,
  unitHpMul: 1.0,
  unitDmgMul: 1.0,
  freeRerolls: 0,
  sellBonus: 0,
  mothershipHpMul: 1.0,
} as const;

const HIVE_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: HIVE_TYPE,
  name: 'Hive',
  description: '生産速度30%UP＋スポーン数50%UP',
  productionTimeMul: 0.7,
  spawnCountMul: 1.5,
  botWeights: [3, 2, 1],
};

const DREADNOUGHT_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: DREADNOUGHT_TYPE,
  name: 'Dreadnought',
  description: '重装甲＋遠距離主砲を搭載',
  productionTimeMul: 1.3,
  botWeights: [1, 2, 1],
};

const REACTOR_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: REACTOR_TYPE,
  name: 'Reactor',
  description: '毎ラウンド+2Cr／スポーン数20%減',
  spawnCountMul: 0.8,
  creditsPerRound: 2,
  botWeights: [1, 1, 1],
};

const COLOSSUS_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: COLOSSUS_TYPE,
  name: 'Colossus',
  description: '少数精鋭：HP/攻撃力2倍、スロット3つ',
  botWeights: [0, 1, 2],
  slotCount: 3,
  unitHpMul: 2.0,
  unitDmgMul: 2.0,
};

const CARRIER_BAY_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: CARRIER_BAY_TYPE,
  name: 'Carrier Bay',
  description: '大器晩成：7スロットで多様な編成が可能',
  botWeights: [1, 1, 2],
  slotCount: 7,
};

const ACCELERATOR_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: ACCELERATOR_TYPE,
  name: 'Accelerator',
  description: '一点特化：スロット1の生産速度3倍',
  botWeights: [1, 2, 1],
  slotCount: 5,
  slotProductionMuls: [3, 1, 1, 1, 1],
};

const SYNDICATE_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: SYNDICATE_TYPE,
  name: 'Syndicate',
  description: '経済特化：無料リロール2回＋売却+1Cr',
  botWeights: [1, 1, 2],
  freeRerolls: 2,
  sellBonus: 1,
};

const BLOODBORNE_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: BLOODBORNE_TYPE,
  name: 'Bloodborne',
  description: '母艦HP半減＋毎ラウンド+4Cr',
  creditsPerRound: 4,
  botWeights: [0, 1, 2],
  mothershipHpMul: 0.5,
};

/** UI セレクタ用の母艦定義リスト */
export const MOTHERSHIP_DEFS: readonly MothershipDef[] = [
  HIVE_DEF,
  DREADNOUGHT_DEF,
  REACTOR_DEF,
  COLOSSUS_DEF,
  CARRIER_BAY_DEF,
  ACCELERATOR_DEF,
  SYNDICATE_DEF,
  BLOODBORNE_DEF,
];

const _defsByType = new Map<number, MothershipDef>(MOTHERSHIP_DEFS.map((d) => [d.type, d]));

/** ニュートラルデフォルト: 全倍率 1.0。母艦撃沈後のフォールバック用 */
const NEUTRAL_DEF: MothershipDef = {
  ...MS_DEFAULTS,
  type: NO_TYPE,
  name: '',
  description: '',
  botWeights: [0, 0, 0],
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
  return { fireRate: ut.fireRate, damage: ut.damage, range: ut.attackRange };
}

export const EMPTY_FLEET_SETUP: FleetSetup = { mothershipType: HIVE_TYPE, slots: [] };

function validateSlotProductionMuls(def: MothershipDef): void {
  const muls = def.slotProductionMuls;
  if (!muls) {
    return;
  }
  if (muls.length !== def.slotCount) {
    throw new Error(
      `MothershipDef ${def.name}: slotProductionMuls.length (${muls.length}) !== slotCount (${def.slotCount})`,
    );
  }
  for (let i = 0; i < muls.length; i++) {
    const v = muls[i];
    if (v === undefined || v <= 0) {
      throw new Error(`MothershipDef ${def.name}: slotProductionMuls[${i}] must be positive, got ${v}`);
    }
  }
}

function validateMothershipDef(def: MothershipDef): void {
  if (unitType(def.type).role !== 'mothership') {
    throw new Error(`MothershipDef type mismatch: ${def.name} (type=${def.type}) must have role=mothership`);
  }
  if (def.slotCount > MAX_SLOT_COUNT) {
    throw new Error(
      `MothershipDef ${def.name}: slotCount (${def.slotCount}) exceeds MAX_SLOT_COUNT (${MAX_SLOT_COUNT})`,
    );
  }
  if (def.mothershipHpMul <= 0) {
    throw new Error(`MothershipDef ${def.name}: mothershipHpMul must be positive, got ${def.mothershipHpMul}`);
  }
  validateSlotProductionMuls(def);
}

for (const def of MOTHERSHIP_DEFS) {
  validateMothershipDef(def);
}
