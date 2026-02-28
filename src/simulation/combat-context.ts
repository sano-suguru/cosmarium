import type { Color3, Unit, UnitIndex, UnitType } from '../types.ts';

export interface CombatContext {
  u: Unit;
  ui: UnitIndex;
  dt: number;
  c: Color3;
  vd: number;
  t: UnitType;
  range: number;
  rng: () => number;
}
