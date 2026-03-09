import { getUnitHWM, poolCounts, unit } from '../pools.ts';
import type { Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';

const VET_TARGET_WEIGHT = 0.3;

export function targetScore(ux: number, uy: number, o: Unit, massWeight: number): number {
  const d2 = (o.x - ux) * (o.x - ux) + (o.y - uy) * (o.y - uy);
  const vf = 1 + VET_TARGET_WEIGHT * o.vet;
  const mf = massWeight > 0 ? 1 + massWeight * unitType(o.type).mass : 1;
  return d2 / (vf * vf * mf * mf);
}

export function findNearestGlobalEnemy(u: Unit, massWeight: number): UnitIndex {
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
    const score = targetScore(u.x, u.y, o, massWeight);
    if (score < bs) {
      bs = score;
      bi = i as UnitIndex;
    }
  }
  return bi;
}
