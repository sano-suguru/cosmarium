import { unit } from '../pools-query.ts';
import type { Unit, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';

interface BoostVelocity {
  vx: number;
  vy: number;
}

const _boostVel: BoostVelocity = { vx: 0, vy: 0 };

export const CATALYST_SPEED_MULT = 1.25;
export const CATALYST_TURN_MULT = 1.3;
export const CATALYST_BOOST_MULT = 1.3;
export const CATALYST_BOOST_DUR_MULT = 1.3;
export const CATALYST_BOOST_CD_MULT = 0.75;
export const CATALYST_BOOST_RANGE_MULT = 1.3;

function tryTriggerBoost(
  u: Unit,
  tgt: number,
  spd: number,
  mult: number,
  dur: number,
  range: number,
): BoostVelocity | null {
  if (tgt === NO_UNIT) {
    return null;
  }
  const o = unit(tgt);
  const dx = o.x - u.x;
  const dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > range) {
    return null;
  }
  u.boostTimer = dur;
  const bv = spd * mult;
  const nd = d || 1;
  _boostVel.vx = (dx / nd) * bv;
  _boostVel.vy = (dy / nd) * bv;
  return _boostVel;
}

interface BoostParams {
  mult: number;
  dur: number;
  cd: number;
  range: number;
}

const _boostParams: BoostParams = { mult: 0, dur: 0, cd: 0, range: 0 };

function resolveBoostParams(boost: NonNullable<UnitType['boost']>, catalyzed: boolean): BoostParams {
  if (catalyzed) {
    _boostParams.mult = boost.multiplier * CATALYST_BOOST_MULT;
    _boostParams.dur = boost.duration * CATALYST_BOOST_DUR_MULT;
    _boostParams.cd = boost.cooldown * CATALYST_BOOST_CD_MULT;
    _boostParams.range = boost.triggerRange * CATALYST_BOOST_RANGE_MULT;
  } else {
    _boostParams.mult = boost.multiplier;
    _boostParams.dur = boost.duration;
    _boostParams.cd = boost.cooldown;
    _boostParams.range = boost.triggerRange;
  }
  return _boostParams;
}

export function tickBoost(
  u: Unit,
  boost: NonNullable<UnitType['boost']>,
  tgt: number,
  spd: number,
  dt: number,
  catalyzed: boolean,
): BoostVelocity | null {
  const { mult, dur, cd, range } = resolveBoostParams(boost, catalyzed);

  if (u.boostTimer > 0) {
    u.boostTimer -= dt;
    if (u.boostTimer <= 0) {
      u.boostTimer = 0;
      u.boostCooldown = cd;
    } else {
      const bv = spd * mult;
      _boostVel.vx = Math.cos(u.angle) * bv;
      _boostVel.vy = Math.sin(u.angle) * bv;
      return _boostVel;
    }
  } else if (u.boostCooldown > 0) {
    u.boostCooldown = Math.max(0, u.boostCooldown - dt);
  }

  if (u.boostTimer <= 0 && u.boostCooldown <= 0) {
    return tryTriggerBoost(u, tgt, spd, mult, dur, range);
  }
  return null;
}

export function tickBoostDuringStun(u: Unit, dt: number) {
  if (u.boostTimer <= 0 && u.boostCooldown <= 0) {
    return;
  }
  const bt = unitType(u.type).boost;
  if (!bt) {
    return;
  }
  if (u.boostTimer > 0) {
    u.boostTimer = 0;
    u.boostCooldown = bt.cooldown;
  }
  if (u.boostCooldown > 0) {
    u.boostCooldown = Math.max(0, u.boostCooldown - dt);
  }
}
