import { PP, PPR, PU } from './constants.ts';
import type { Particle, Projectile, Unit } from './types.ts';

export var uP: Unit[] = [];
export var pP: Particle[] = [];
export var prP: Projectile[] = [];

export var poolCounts = { uC: 0, pC: 0, prC: 0 };

for (let i = 0; i < PU; i++) {
  uP[i] = {
    alive: false,
    team: 0,
    type: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ang: 0,
    hp: 0,
    mhp: 0,
    cd: 0,
    tgt: -1,
    wn: 0,
    tT: 0,
    mass: 1,
    aCd: 0,
    shielded: false,
    stun: 0,
    sCd: 0,
    tp: 0,
    beamOn: 0,
    kills: 0,
    vet: 0,
  };
}
for (let i = 0; i < PP; i++) {
  pP[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, ml: 0, sz: 0, r: 0, g: 0, b: 0, sh: 0 };
}
for (let i = 0; i < PPR; i++) {
  prP[i] = {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    dmg: 0,
    team: 0,
    sz: 0,
    r: 0,
    g: 0,
    b: 0,
    hom: false,
    aoe: 0,
    tx: -1,
  };
}
