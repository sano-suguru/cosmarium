import { getTrackingBeam, trackingBeams } from '../beams.ts';
import {
  AMP_BOOST_LINGER,
  CATALYST_BOOST_LINGER,
  NEIGHBOR_RANGE,
  REFLECT_FIELD_MAX_HP,
  SCRAMBLE_BOOST_LINGER,
} from '../constants.ts';
import { unitIdx } from '../pool-index.ts';
import { getUnitHWM, poolCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import { emitSupport } from './hooks.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { addTrackingBeam } from './spawn-beams.ts';

export const SHIELD_LINGER = 2;
export const TETHER_BEAM_LIFE = 0.7;
export const REFLECT_FIELD_GRANT_INTERVAL = 1;
const REFLECT_FIELD_RADIUS = 100;
const BASTION_SHIELD_RADIUS = 120;
const BASTION_MAX_TETHERS = 4;
const AMP_RADIUS = 120;
const AMP_MAX_TETHERS = 4;
const AMP_TETHER_BEAM_LIFE = 0.7;
const SCRAMBLE_RADIUS = 110;
const CATALYST_RADIUS = 110;

// static invariant: 全フィールド半径 ≤ NEIGHBOR_RANGE（これを超えると近傍検索の範囲外になる）
const maxFieldRadius = Math.max(
  REFLECT_FIELD_RADIUS,
  BASTION_SHIELD_RADIUS,
  AMP_RADIUS,
  SCRAMBLE_RADIUS,
  CATALYST_RADIUS,
);
if (maxFieldRadius > NEIGHBOR_RANGE) {
  throw new Error(`フィールド半径 (${maxFieldRadius}) が NEIGHBOR_RANGE (${NEIGHBOR_RANGE}) を超えています`);
}

function refreshTetherBeam(src: UnitIndex, tgt: UnitIndex): boolean {
  for (let i = 0; i < trackingBeams.length; i++) {
    const tb = getTrackingBeam(i);
    if (tb.srcUnit === src && tb.tgtUnit === tgt) {
      tb.life = tb.maxLife;
      return true;
    }
  }
  return false;
}

// tether/amp 用共有バッファ — 逐次ループのため同時使用は起きない
const _tetherOi = new Int32Array(BASTION_MAX_TETHERS);
const _tetherDist = new Float64Array(BASTION_MAX_TETHERS);

function bubbleInsert(oiArr: Int32Array, distArr: Float64Array, start: number, oi: number, d: number) {
  let p = start;
  while (p > 0 && (distArr[p - 1] ?? 0) > d) {
    oiArr[p] = oiArr[p - 1] ?? 0;
    distArr[p] = distArr[p - 1] ?? 0;
    p--;
  }
  oiArr[p] = oi;
  distArr[p] = d;
}

const _ampOi = new Int32Array(AMP_MAX_TETHERS);
const _ampDist = new Float64Array(AMP_MAX_TETHERS);

const REFLECT_FIELD_RADIUS_SQ = REFLECT_FIELD_RADIUS * REFLECT_FIELD_RADIUS;
const BASTION_SHIELD_RADIUS_SQ = BASTION_SHIELD_RADIUS * BASTION_SHIELD_RADIUS;
const AMP_RADIUS_SQ = AMP_RADIUS * AMP_RADIUS;
const SCRAMBLE_RADIUS_SQ = SCRAMBLE_RADIUS * SCRAMBLE_RADIUS;
const CATALYST_RADIUS_SQ = CATALYST_RADIUS * CATALYST_RADIUS;

function applyReflectorAllyField(u: Unit, i: number, nn: number, dt: number) {
  if (u.maxEnergy <= 0) {
    return;
  }
  if (u.fieldGrantCooldown > 0) {
    u.fieldGrantCooldown = Math.max(0, u.fieldGrantCooldown - dt);
    return;
  }
  let granted = false;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i || unitType(o.type).reflects) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy > REFLECT_FIELD_RADIUS_SQ) {
      continue;
    }
    if (o.reflectFieldHp <= 0) {
      o.reflectFieldHp = REFLECT_FIELD_MAX_HP;
      granted = true;
    }
  }
  if (granted) {
    u.fieldGrantCooldown = REFLECT_FIELD_GRANT_INTERVAL;
  }
}

function tetherNearbyAllies(u: Unit, i: number, nn: number) {
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (d > BASTION_SHIELD_RADIUS_SQ) {
      continue;
    }
    if (count < BASTION_MAX_TETHERS) {
      bubbleInsert(_tetherOi, _tetherDist, count, oi, d);
      count++;
    } else if (d < (_tetherDist[count - 1] ?? 0)) {
      bubbleInsert(_tetherOi, _tetherDist, count - 1, oi, d);
    }
  }
  const ui = unitIdx(i);
  for (let j = 0; j < count; j++) {
    const oi = unitIdx(_tetherOi[j] ?? 0);
    const o = unit(oi);
    if (!refreshTetherBeam(ui, oi)) {
      addTrackingBeam(ui, oi, 0.3, 0.6, 1.0, TETHER_BEAM_LIFE, 1.5);
    }
    o.shieldLingerTimer = SHIELD_LINGER;
    o.shieldSourceUnit = ui;
  }
}

function collectAmpCandidates(u: Unit, i: number, nn: number): number {
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) {
      continue;
    }
    if (unitType(o.type).amplifies) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (d > AMP_RADIUS_SQ) {
      continue;
    }
    if (count < AMP_MAX_TETHERS) {
      bubbleInsert(_ampOi, _ampDist, count, oi, d);
      count++;
    } else if (d < (_ampDist[count - 1] ?? 0)) {
      bubbleInsert(_ampOi, _ampDist, count - 1, oi, d);
    }
  }
  return count;
}

function amplifyNearbyAllies(u: Unit, i: number, nn: number) {
  const count = collectAmpCandidates(u, i, nn);
  const ui = unitIdx(i);
  for (let j = 0; j < count; j++) {
    const oi = unitIdx(_ampOi[j] ?? 0);
    const o = unit(oi);
    if (!refreshTetherBeam(ui, oi)) {
      addTrackingBeam(ui, oi, 1.0, 0.6, 0.15, AMP_TETHER_BEAM_LIFE, 1.5);
    }
    o.ampBoostTimer = AMP_BOOST_LINGER;
    emitSupport(u.type, u.team, o.type, o.team, 'amp', 1);
  }
}

function scrambleNearbyEnemies(u: Unit, i: number, nn: number) {
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team === u.team || oi === i) {
      continue;
    }
    if (unitType(o.type).scrambles) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy > SCRAMBLE_RADIUS_SQ) {
      continue;
    }
    o.scrambleTimer = SCRAMBLE_BOOST_LINGER;
    emitSupport(u.type, u.team, o.type, o.team, 'scramble', 1);
  }
}

function catalyzeNearbyAllies(u: Unit, i: number, nn: number) {
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) {
      continue;
    }
    if (unitType(o.type).catalyzes) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy > CATALYST_RADIUS_SQ) {
      continue;
    }
    o.catalystTimer = CATALYST_BOOST_LINGER;
    emitSupport(u.type, u.team, o.type, o.team, 'catalyst', 1);
  }
}

function applyUnitFields(u: Unit, i: number, nn: number, dt: number) {
  const t = unitType(u.type);
  if (t.reflects) {
    applyReflectorAllyField(u, i, nn, dt);
  }
  if (t.shields) {
    tetherNearbyAllies(u, i, nn);
  }
  if (t.amplifies) {
    amplifyNearbyAllies(u, i, nn);
  }
  if (t.scrambles) {
    scrambleNearbyEnemies(u, i, nn);
  }
  if (t.catalyzes) {
    catalyzeNearbyAllies(u, i, nn);
  }
}

/** 全ユニット combat 完了後にフィールド能力を独立パスで付与 */
export function applyAllFields(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    const t = unitType(u.type);
    if (t.reflects || t.shields || t.amplifies || t.scrambles || t.catalyzes) {
      const nn = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
      applyUnitFields(u, i, nn, dt);
    }
  }
}
