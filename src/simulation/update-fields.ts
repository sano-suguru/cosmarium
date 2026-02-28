import { getTrackingBeam, trackingBeams } from '../beams.ts';
import {
  AMP_BOOST_LINGER,
  CATALYST_BOOST_LINGER,
  POOL_UNITS,
  REFLECT_FIELD_MAX_HP,
  SCRAMBLE_BOOST_LINGER,
} from '../constants.ts';
import { poolCounts, unit } from '../pools.ts';
import type { Unit, UnitIndex } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { addTrackingBeam } from './spawn.ts';

export const SHIELD_LINGER = 2;
export const TETHER_BEAM_LIFE = 0.7;
const HIT_FLASH_DURATION = 0.08;
export const REFLECT_FIELD_GRANT_INTERVAL = 1;
const REFLECT_FIELD_RADIUS = 100;
const BASTION_SHIELD_RADIUS = 120;
const BASTION_MAX_TETHERS = 4;
const AMP_RADIUS = 120;
const AMP_MAX_TETHERS = 4;
const AMP_TETHER_BEAM_LIFE = 0.7;
const SCRAMBLE_RADIUS = 110;
const CATALYST_RADIUS = 110;

function tickReflectorShield(u: Unit, dt: number) {
  if (u.shieldCooldown <= 0) return;
  u.shieldCooldown -= dt;
  if (u.shieldCooldown <= 0) {
    u.shieldCooldown = 0;
    u.energy = u.maxEnergy;
  }
}

/** エネルギー自然回復（stun 中も回復する）。Reflectorはシールドクールダウン→全回復制 */
export function regenEnergy(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.maxEnergy <= 0) continue;
    const t = unitType(u.type);
    if (t.reflects) {
      tickReflectorShield(u, dt);
    } else {
      const regen = t.energyRegen;
      u.energy = Math.min(u.maxEnergy, u.energy + regen * dt);
    }
  }
}

export function decayHitFlash(dt: number) {
  const decay = dt / HIT_FLASH_DURATION;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - decay);
  }
}

function decayShieldTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.shieldLingerTimer > 0) u.shieldLingerTimer = Math.max(0, u.shieldLingerTimer - dt);
  }
}

function applyReflectorAllyField(u: Unit, i: number, dt: number) {
  if (u.maxEnergy <= 0) return;
  if (u.fieldGrantCooldown > 0) {
    u.fieldGrantCooldown = Math.max(0, u.fieldGrantCooldown - dt);
    return;
  }
  let granted = false;
  const nn = getNeighbors(u.x, u.y, REFLECT_FIELD_RADIUS);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i || unitType(o.type).reflects) continue;
    if (o.reflectFieldHp <= 0) {
      o.reflectFieldHp = REFLECT_FIELD_MAX_HP;
      granted = true;
    }
  }
  if (granted) {
    u.fieldGrantCooldown = REFLECT_FIELD_GRANT_INTERVAL;
  }
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

// tetherNearbyAllies 用ソート済みバッファ — サイズは BASTION_MAX_TETHERS に結合。
// 複数 Bastion が存在しても applyShieldsAndFields 内の逐次ループで呼ばれるため同時使用は起きない。
const _tetherOi = new Int32Array(BASTION_MAX_TETHERS);
const _tetherDist = new Float64Array(BASTION_MAX_TETHERS);

/** 固定サイズ (BASTION_MAX_TETHERS=4) のため挿入ソートで十分 */
function tetherBubbleInsert(start: number, oi: number, d: number) {
  let p = start;
  while (p > 0 && (_tetherDist[p - 1] ?? 0) > d) {
    _tetherOi[p] = _tetherOi[p - 1] ?? 0;
    _tetherDist[p] = _tetherDist[p - 1] ?? 0;
    p--;
  }
  _tetherOi[p] = oi;
  _tetherDist[p] = d;
}

function tetherNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, BASTION_SHIELD_RADIUS);
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (count < BASTION_MAX_TETHERS) {
      tetherBubbleInsert(count, oi, d);
      count++;
    } else if (d < (_tetherDist[count - 1] ?? 0)) {
      tetherBubbleInsert(count - 1, oi, d);
    }
  }
  for (let j = 0; j < count; j++) {
    const oi = (_tetherOi[j] ?? 0) as UnitIndex;
    const o = unit(oi);
    if (!refreshTetherBeam(i as UnitIndex, oi)) {
      addTrackingBeam(i as UnitIndex, oi, 0.3, 0.6, 1.0, TETHER_BEAM_LIFE, 1.5);
    }
    o.shieldLingerTimer = SHIELD_LINGER;
    o.shieldSourceUnit = i as UnitIndex;
  }
}

// amplifyNearbyAllies 用ソート済みバッファ — tetherNearbyAllies とは独立。
const _ampOi = new Int32Array(AMP_MAX_TETHERS);
const _ampDist = new Float64Array(AMP_MAX_TETHERS);

function ampBubbleInsert(start: number, oi: number, d: number) {
  let p = start;
  while (p > 0 && (_ampDist[p - 1] ?? 0) > d) {
    _ampOi[p] = _ampOi[p - 1] ?? 0;
    _ampDist[p] = _ampDist[p - 1] ?? 0;
    p--;
  }
  _ampOi[p] = oi;
  _ampDist[p] = d;
}

function amplifyNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, AMP_RADIUS);
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) continue;
    if (unitType(o.type).amplifies) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (count < AMP_MAX_TETHERS) {
      ampBubbleInsert(count, oi, d);
      count++;
    } else if (d < (_ampDist[count - 1] ?? 0)) {
      ampBubbleInsert(count - 1, oi, d);
    }
  }
  for (let j = 0; j < count; j++) {
    const oi = (_ampOi[j] ?? 0) as UnitIndex;
    const o = unit(oi);
    if (!refreshTetherBeam(i as UnitIndex, oi)) {
      addTrackingBeam(i as UnitIndex, oi, 1.0, 0.6, 0.15, AMP_TETHER_BEAM_LIFE, 1.5);
    }
    o.ampBoostTimer = AMP_BOOST_LINGER;
  }
}

function decayAmpTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.ampBoostTimer > 0) u.ampBoostTimer = Math.max(0, u.ampBoostTimer - dt);
  }
}
function decayScrambleTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.scrambleTimer > 0) u.scrambleTimer = Math.max(0, u.scrambleTimer - dt);
  }
}

function scrambleNearbyEnemies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, SCRAMBLE_RADIUS);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team === u.team || oi === i) continue;
    if (unitType(o.type).scrambles) continue;
    o.scrambleTimer = SCRAMBLE_BOOST_LINGER;
  }
}

function decayCatalystTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.catalystTimer > 0) u.catalystTimer = Math.max(0, u.catalystTimer - dt);
  }
}
function catalyzeNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, CATALYST_RADIUS);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) continue;
    if (unitType(o.type).catalyzes) continue;
    o.catalystTimer = CATALYST_BOOST_LINGER;
  }
}

export function applyShieldsAndFields(dt: number) {
  decayShieldTimers(dt);
  decayAmpTimers(dt);
  decayScrambleTimers(dt);
  decayCatalystTimers(dt);
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const t = unitType(u.type);
    if (t.reflects) applyReflectorAllyField(u, i, dt);
    if (t.shields) tetherNearbyAllies(u, i);
    if (t.amplifies) amplifyNearbyAllies(u, i);
    if (t.scrambles) scrambleNearbyEnemies(u, i);
    if (t.catalyzes) catalyzeNearbyAllies(u, i);
  }
}
