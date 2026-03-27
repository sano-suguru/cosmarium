import { POOL_PARTICLES, POOL_PROJECTILES, POOL_SQUADRONS, POOL_UNITS } from './constants.ts';
import { TEAM0 } from './team.ts';
import type { Particle, Projectile, Squadron, Unit } from './types.ts';
import { NO_MODULE, NO_SQUADRON, NO_TYPE, NO_UNIT } from './types.ts';
import { DEFAULT_UNIT_TYPE } from './unit-type-accessors.ts';

export const unitPool: Unit[] = [];
export const particlePool: Particle[] = [];
export const projectilePool: Projectile[] = [];
export const squadronPool: Squadron[] = [];

for (let i = 0; i < POOL_UNITS; i++) {
  unitPool[i] = {
    alive: false,
    team: 0,
    type: DEFAULT_UNIT_TYPE,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 0,
    maxHp: 0,
    cooldown: 0,
    target: NO_UNIT,
    wanderAngle: 0,
    trailTimer: 0,
    mass: 1,
    abilityCooldown: 0,
    shieldLingerTimer: 0,
    stun: 0,
    boostTimer: 0,
    boostCooldown: 0,
    spawnCooldown: 0,
    teleportTimer: 0,
    beamOn: 0,
    sweepPhase: 0,
    sweepBaseAngle: 0,
    burstCount: 0,
    broadsidePhase: 0,
    swarmN: 0,
    hitFlash: 0,
    kbVx: 0,
    kbVy: 0,
    blinkCount: 0,
    blinkPhase: 0,
    energy: 0,
    maxEnergy: 0,
    shieldSourceUnit: NO_UNIT,
    shieldCooldown: 0,
    reflectFieldHp: 0,
    fieldGrantCooldown: 0,
    ampBoostTimer: 0,
    scrambleTimer: 0,
    catalystTimer: 0,
    mergeDmgMul: 1,
    moduleId: NO_MODULE,
    squadronIdx: NO_SQUADRON,
  };
}
for (let i = 0; i < POOL_SQUADRONS; i++) {
  squadronPool[i] = {
    alive: false,
    team: TEAM0,
    leader: NO_UNIT,
    objectiveX: 0,
    objectiveY: 0,
    objectiveTimer: 0,
    memberCount: 0,
  };
}
for (let i = 0; i < POOL_PARTICLES; i++) {
  particlePool[i] = {
    alive: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    size: 0,
    r: 0,
    g: 0,
    b: 0,
    shape: 0,
  };
}
for (let i = 0; i < POOL_PROJECTILES; i++) {
  projectilePool[i] = {
    alive: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
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
    target: NO_UNIT,
    sourceUnit: NO_UNIT,
    sourceType: NO_TYPE,
  };
}
