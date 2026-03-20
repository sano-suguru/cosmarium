import { unitIdx } from '../pool-index.ts';
import { getUnitHWM, poolCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';

/** 戦闘ユニット mass 範囲の上限。母艦級 mass（45+）での発散を防止 */
export const MASS_CAP = 30;
/** 負 massWeight 時の massFactor 下限。mf²=0.0625 → スコア最大16倍増 */
export const MIN_MASS_FACTOR = 0.25;

export function massFactor(massWeight: number, om: number): number {
  const m = Math.min(om, MASS_CAP);
  const base = 1 + Math.abs(massWeight) * m;
  return massWeight > 0 ? base : Math.max(1 / base, MIN_MASS_FACTOR);
}

/**
 * ターゲット優先度スコア（低いほど優先）。
 * mass 嗜好は aggroR2 内でのみ適用 — 交戦範囲外では純粋な距離² を返す。
 * これにより遠方の高 mass 敵（母艦等）への過剰な引力を構造的に防止する。
 */
export function targetScore(ux: number, uy: number, o: Unit, massWeight: number, aggroR2: number): number {
  const d2 = (o.x - ux) * (o.x - ux) + (o.y - uy) * (o.y - uy);
  if (massWeight === 0 || d2 > aggroR2) {
    return d2;
  }
  const mf = massFactor(massWeight, unitType(o.type).mass);
  return d2 / (mf * mf);
}

export function findNearestGlobalEnemy(u: Unit, massWeight: number, aggroR2: number): UnitIndex {
  let bs = 1e18,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const o = unit(i);
    if (!o.alive) {
      continue;
    }
    rem--;
    if (o.team === u.team) {
      continue;
    }
    const score = targetScore(u.x, u.y, o, massWeight, aggroR2);
    if (score < bs) {
      bs = score;
      bi = unitIdx(i);
    }
  }
  return bi;
}
