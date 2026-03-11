import { particlePool, projectilePool, squadronPool, unitPool } from './pools-init.ts';
import type { Particle, Projectile, Squadron, Unit } from './types.ts';

export function unit(i: number): Unit {
  const u = unitPool[i];
  if (u === undefined) {
    throw new RangeError(`Invalid unit index: ${i}`);
  }
  return u;
}

export function particle(i: number): Particle {
  const p = particlePool[i];
  if (p === undefined) {
    throw new RangeError(`Invalid particle index: ${i}`);
  }
  return p;
}

export function projectile(i: number): Projectile {
  const p = projectilePool[i];
  if (p === undefined) {
    throw new RangeError(`Invalid projectile index: ${i}`);
  }
  return p;
}

export function squadron(i: number): Squadron {
  const s = squadronPool[i];
  if (s === undefined) {
    throw new RangeError(`Invalid squadron index: ${i}`);
  }
  return s;
}
