import type { ParticleIndex, ProjectileIndex, SquadronIndex, UnitIndex } from './types.ts';

export function unitIdx(i: number): UnitIndex {
  return i as UnitIndex;
}
export function particleIdx(i: number): ParticleIndex {
  return i as ParticleIndex;
}
export function projectileIdx(i: number): ProjectileIndex {
  return i as ProjectileIndex;
}
export function squadronIdx(i: number): SquadronIndex {
  return i as SquadronIndex;
}
