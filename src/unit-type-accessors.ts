import type { UnitRole, UnitType, UnitTypeIndex } from './types.ts';
import { TYPES } from './unit-types.ts';

/** 母艦タイプ判定（Hive / Dreadnought / Reactor） */
export function isMothership(t: UnitTypeIndex): boolean {
  return checked(t).role === 'mothership';
}

const _invSqrtMass: number[] = TYPES.map((t) => 1 / Math.sqrt(t.mass));

function checked(id: number): UnitType {
  const t = TYPES[id];
  if (t === undefined) {
    throw new RangeError(`Invalid unit type id: ${id}`);
  }
  return t;
}
export function unitType(id: UnitTypeIndex): UnitType {
  return checked(id);
}
export function invSqrtMass(id: UnitTypeIndex): number {
  const v = _invSqrtMass[id];
  if (v === undefined) {
    throw new RangeError(`Invalid unit type id: ${id}`);
  }
  return v;
}
export function unitTypeIndex(name: string): UnitTypeIndex {
  const idx = TYPES.findIndex((t) => t.name === name);
  if (idx === -1) {
    throw new RangeError(`Unknown unit type name: ${name}`);
  }
  return idx as UnitTypeIndex;
}
const T = unitTypeIndex;
export const DRONE_TYPE = T('Drone');
export const FIGHTER_TYPE = T('Fighter');
export const BOMBER_TYPE = T('Bomber');
export const CRUISER_TYPE = T('Cruiser');
export const FLAGSHIP_TYPE = T('Flagship');
export const HEALER_TYPE = T('Healer');
export const REFLECTOR_TYPE = T('Reflector');
export const CARRIER_TYPE = T('Carrier');
export const SNIPER_TYPE = T('Sniper');
export const LANCER_TYPE = T('Lancer');
export const LAUNCHER_TYPE = T('Launcher');
export const DISRUPTOR_TYPE = T('Disruptor');
export const SCORCHER_TYPE = T('Scorcher');
export const TELEPORTER_TYPE = T('Teleporter');
export const ARCER_TYPE = T('Arcer');
export const BASTION_TYPE = T('Bastion');
export const AMPLIFIER_TYPE = T('Amplifier');
export const SCRAMBLER_TYPE = T('Scrambler');
export const CATALYST_TYPE = T('Catalyst');
export const HIVE_TYPE = T('Hive');
export const DREADNOUGHT_TYPE = T('Dreadnought');
export const REACTOR_TYPE = T('Reactor');
export const ASTEROID_TYPE = T('Asteroid');
export const ASTEROID_LARGE_TYPE = T('Asteroid Core');
export const DEFAULT_UNIT_TYPE = 0 as UnitTypeIndex;
export const TYPE_INDICES: readonly UnitTypeIndex[] = TYPES.map((_, i) => i as UnitTypeIndex);
export function unitTypeName(idx: UnitTypeIndex): string {
  return checked(idx).name;
}
export function unitTypeCost(idx: UnitTypeIndex): number {
  return checked(idx).cost;
}
export function findTypeIndex(name: string): UnitTypeIndex | undefined {
  const idx = TYPES.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
  return idx === -1 ? undefined : (idx as UnitTypeIndex);
}
export function unitTypeIdx(i: number): UnitTypeIndex {
  if (i < 0 || i >= TYPES.length) {
    throw new RangeError(`Invalid unit type index: ${i}`);
  }
  return i as UnitTypeIndex;
}
export const FLAGSHIP_ENGINE_OFFSETS = [0.18, 0.38] as const;
export const ROLE_LABELS: Record<UnitRole, string> = {
  attack: '攻撃',
  support: '支援',
  special: '特殊',
  environment: '環境',
  mothership: '母艦',
};
