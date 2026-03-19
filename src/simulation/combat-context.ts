import type { Color3, Unit, UnitIndex, UnitType } from '../types.ts';

export type ShakeFn = (intensity: number, x: number, y: number) => void;

export interface TeamCombatMods {
  readonly attackCdMul: number;
  readonly dmgMul: number;
}

export interface MutableTeamCombatMods {
  attackCdMul: number;
  dmgMul: number;
}

export interface CombatContext {
  u: Unit;
  ui: UnitIndex;
  dt: number;
  c: Color3;
  baseDmgMul: number;
  t: UnitType;
  range: number;
  rng: () => number;
  shake: ShakeFn;
}
