import { getUnitHWM, poolCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Unit } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';

const HIT_FLASH_DURATION = 0.08;

function decayTimer(value: number, delta: number): number {
  return value > 0 ? Math.max(0, value - delta) : value;
}

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
    u.hitFlash = decayTimer(u.hitFlash, flashDecay);
    regenUnitEnergy(u, dt);
    u.shieldLingerTimer = decayTimer(u.shieldLingerTimer, dt);
    u.ampBoostTimer = decayTimer(u.ampBoostTimer, dt);
    u.scrambleTimer = decayTimer(u.scrambleTimer, dt);
    u.catalystTimer = decayTimer(u.catalystTimer, dt);
  }
}
