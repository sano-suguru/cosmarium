import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from './constants.ts';
import type { Particle, Projectile, Unit } from './types.ts';

export const uP: Unit[] = [];
export const pP: Particle[] = [];
export const prP: Projectile[] = [];

export const poolCounts = { uC: 0, pC: 0, prC: 0 };

for (let i = 0; i < POOL_UNITS; i++) {
  uP[i] = {
    alive: false,
    team: 0,
    type: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 0,
    maxHp: 0,
    cooldown: 0,
    target: -1,
    wanderAngle: 0,
    trailTimer: 0,
    mass: 1,
    abilityCooldown: 0,
    shielded: false,
    stun: 0,
    spawnCooldown: 0,
    teleportTimer: 0,
    beamOn: 0,
    kills: 0,
    vet: 0,
  };
}
for (let i = 0; i < POOL_PARTICLES; i++) {
  pP[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, r: 0, g: 0, b: 0, shape: 0 };
}
for (let i = 0; i < POOL_PROJECTILES; i++) {
  prP[i] = {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    damage: 0,
    team: 0,
    size: 0,
    r: 0,
    g: 0,
    b: 0,
    homing: false,
    aoe: 0,
    targetIndex: -1,
  };
}
