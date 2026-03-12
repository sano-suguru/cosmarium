import { WORLD_SIZE } from '../constants.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import type { SteerForce } from './boids.ts';
import { getNeighborAt } from './spatial-hash.ts';

const WANDER_WEIGHT = 0.25;
const WANDER_ONLY_SCALE = 0.5;

import { nearestEnemyCenter } from './team-center.ts';

const _engageForce: SteerForce = { x: 0, y: 0 };
const _retreatForce: SteerForce = { x: 0, y: 0 };
const _healForce: SteerForce = { x: 0, y: 0 };
const _centroidForce: SteerForce = { x: 0, y: 0 };

/** seek 重みが SEEK_MAX_WEIGHT に飽和する距離 */
const SEEK_FULL_WEIGHT_DIST = WORLD_SIZE / 12;
/** seek 重みの上限 */
const SEEK_MAX_WEIGHT = 1.0;
/** seek 処理をスキップする距離²の下限（重心に十分近い場合ゼロ除算回避兼 seek 不要） */
const SEEK_MIN_DIST_SQ = 1;
const MASS_TIEBREAK_FACTOR = 0.01;
const RETREAT_SPEED_SCALE = 2.5;
export const SUPPORT_FOLLOW_WEIGHT = 0.15;

function engageTarget(u: Unit, tgt: UnitIndex, t: UnitType): SteerForce {
  const o = unit(tgt);
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  if (t.rams) {
    _engageForce.x = (dx / d) * t.speed * 3;
    _engageForce.y = (dy / d) * t.speed * 3;
    return _engageForce;
  }
  if (d > t.engageMax) {
    _engageForce.x = (dx / d) * t.speed * 2;
    _engageForce.y = (dy / d) * t.speed * 2;
    return _engageForce;
  }
  if (d < t.engageMin) {
    const urgency = 1 - d / t.engageMin;
    const mult = 1 + urgency;
    _engageForce.x = -(dx / d) * t.speed * mult;
    _engageForce.y = -(dy / d) * t.speed * mult;
    return _engageForce;
  }
  _engageForce.x = (-dy / d) * t.speed * 0.8;
  _engageForce.y = (dx / d) * t.speed * 0.8;
  return _engageForce;
}

function wanderForce(u: Unit, t: UnitType, dt: number, rng: () => number): SteerForce {
  u.wanderAngle += (rng() - 0.5) * 2 * dt;
  const ec = nearestEnemyCenter(u.team, u.x, u.y);
  if (ec) {
    const dx = ec.x - u.x;
    const dy = ec.y - u.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > SEEK_MIN_DIST_SQ) {
      const dist = Math.sqrt(d2);
      const seekW = Math.min(dist / SEEK_FULL_WEIGHT_DIST, SEEK_MAX_WEIGHT);
      const sx = (dx / dist) * seekW;
      const sy = (dy / dist) * seekW;
      const wx = Math.cos(u.wanderAngle) * WANDER_WEIGHT;
      const wy = Math.sin(u.wanderAngle) * WANDER_WEIGHT;
      const fx = sx + wx;
      const fy = sy + wy;
      const fLen = Math.sqrt(fx * fx + fy * fy) || 1;
      _engageForce.x = (fx / fLen) * t.speed;
      _engageForce.y = (fy / fLen) * t.speed;
      return _engageForce;
    }
  }
  _engageForce.x = Math.cos(u.wanderAngle) * t.speed * WANDER_ONLY_SCALE;
  _engageForce.y = Math.sin(u.wanderAngle) * t.speed * WANDER_ONLY_SCALE;
  return _engageForce;
}

export function computeEngagementForce(
  u: Unit,
  tgt: UnitIndex,
  t: UnitType,
  dt: number,
  rng: () => number,
): SteerForce {
  if (tgt !== NO_UNIT) {
    return engageTarget(u, tgt, t);
  }
  return wanderForce(u, t, dt, rng);
}

export function computeRetreatForce(u: Unit, nn: number, t: UnitType, hpRatio: number): SteerForce {
  if (t.retreatHpRatio === undefined || hpRatio >= t.retreatHpRatio) {
    _retreatForce.x = 0;
    _retreatForce.y = 0;
    return _retreatForce;
  }
  const urgency = 1 - hpRatio / t.retreatHpRatio;
  let rx = 0,
    ry = 0;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team === u.team || !o.alive) {
      continue;
    }
    const dx = u.x - o.x,
      dy = u.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) {
      continue;
    }
    const f = t.range / d;
    rx += (dx / d) * f;
    ry += (dy / d) * f;
  }
  // sigmoidスケーリング: 近距離・多敵で飽和、遠距離・少敵で減衰する滑らかな曲線
  const mag = Math.sqrt(rx * rx + ry * ry);
  if (mag > 0) {
    const s = mag / (1 + mag);
    rx = (rx / mag) * s;
    ry = (ry / mag) * s;
  }
  const scale = urgency * t.speed * RETREAT_SPEED_SCALE;
  _retreatForce.x = rx * scale;
  _retreatForce.y = ry * scale;
  return _retreatForce;
}

export function computeHealerFollow(u: Unit, nn: number, t: UnitType): SteerForce {
  // bs = -1: score は常に正なので最初の候補が必ず選ばれる
  let bs = -1,
    bi: UnitIndex = NO_UNIT;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team !== u.team || !o.alive || o === u) {
      continue;
    }
    const hpRatio = o.hp / o.maxHp;
    const score = 1 - hpRatio + unitType(o.type).mass * MASS_TIEBREAK_FACTOR;
    if (score > bs) {
      bs = score;
      bi = oi;
    }
  }
  if (bi !== NO_UNIT) {
    const o = unit(bi);
    const dx = o.x - u.x;
    const dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    _healForce.x = (dx / d) * t.speed;
    _healForce.y = (dy / d) * t.speed;
    return _healForce;
  }
  _healForce.x = 0;
  _healForce.y = 0;
  return _healForce;
}

/** 近隣味方の重心に向かう力を返す（Amplifier/Catalyst 用） */
export function computeAllyCentroidFollow(u: Unit, nn: number, t: UnitType): SteerForce {
  let cx = 0,
    cy = 0,
    count = 0;
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = unit(oi);
    if (o.team !== u.team || !o.alive || o === u) {
      continue;
    }
    cx += o.x;
    cy += o.y;
    count++;
  }
  if (count > 0) {
    cx /= count;
    cy /= count;
    const dx = cx - u.x;
    const dy = cy - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    _centroidForce.x = (dx / d) * t.speed;
    _centroidForce.y = (dy / d) * t.speed;
    return _centroidForce;
  }
  _centroidForce.x = 0;
  _centroidForce.y = 0;
  return _centroidForce;
}
