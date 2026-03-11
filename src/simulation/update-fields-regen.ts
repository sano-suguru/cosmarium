import { getUnitHWM, poolCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Unit } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';

const HIT_FLASH_DURATION = 0.08;

function tickReflectorShield(u: Unit, dt: number) {
  if (u.shieldCooldown <= 0) {
    return;
  }
  u.shieldCooldown -= dt;
  if (u.shieldCooldown <= 0) {
    u.shieldCooldown = 0;
    u.energy = u.maxEnergy;
  }
}

function regenUnitEnergy(u: Unit, dt: number) {
  if (u.maxEnergy <= 0) {
    return;
  }
  const t = unitType(u.type);
  if (t.reflects) {
    tickReflectorShield(u, dt);
  } else {
    u.energy = Math.min(u.maxEnergy, u.energy + t.energyRegen * dt);
  }
}

export function decayAndRegen(dt: number) {
  const flashDecay = dt / HIT_FLASH_DURATION;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    if (u.hitFlash > 0) {
      u.hitFlash = Math.max(0, u.hitFlash - flashDecay);
    }
    regenUnitEnergy(u, dt);
    if (u.shieldLingerTimer > 0) {
      u.shieldLingerTimer = Math.max(0, u.shieldLingerTimer - dt);
    }
    if (u.ampBoostTimer > 0) {
      u.ampBoostTimer = Math.max(0, u.ampBoostTimer - dt);
    }
    if (u.scrambleTimer > 0) {
      u.scrambleTimer = Math.max(0, u.scrambleTimer - dt);
    }
    if (u.catalystTimer > 0) {
      u.catalystTimer = Math.max(0, u.catalystTimer - dt);
    }
  }
}
