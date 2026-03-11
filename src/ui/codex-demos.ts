import { unit } from '../pools.ts';
import { spawnUnit } from '../simulation/spawn.ts';
import type { DemoFlag, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { CRUISER_TYPE, DRONE_TYPE, FIGHTER_TYPE, SCORCHER_TYPE } from '../unit-type-accessors.ts';

/** Codexデモは決定性に影響しないためMath.randomを使用 */
export const demoRng: () => number = Math.random;

function demoDroneSwarm(mi: UnitIndex) {
  for (let i = 0; i < 5; i++) {
    const a = ((i + 1) / 6) * Math.PI * 2;
    spawnUnit(0, DRONE_TYPE, Math.cos(a) * 40, Math.sin(a) * 40, demoRng);
  }
  for (let i = 0; i < 6; i++) {
    const ei = spawnUnit(1, DRONE_TYPE, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 120, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoBurstFighter(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, FIGHTER_TYPE, 200 + (demoRng() - 0.5) * 60, (i - 1) * 60, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoHealer() {
  const ai = spawnUnit(0, FIGHTER_TYPE, -60, 0, demoRng);
  if (ai !== NO_UNIT) {
    unit(ai).hp = 3;
  }
  const ai2 = spawnUnit(0, DRONE_TYPE, 60, -40, demoRng);
  if (ai2 !== NO_UNIT) {
    unit(ai2).hp = 1;
  }
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, DRONE_TYPE, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 120, demoRng);
  }
}

function demoReflector(mi: UnitIndex) {
  for (let i = 0; i < 2; i++) {
    spawnUnit(0, FIGHTER_TYPE, -40, (i === 0 ? -1 : 1) * 30, demoRng);
  }
  const fi = spawnUnit(1, FIGHTER_TYPE, -120, 0, demoRng);
  if (fi !== NO_UNIT) {
    unit(fi).target = mi;
  }
  const bi1 = spawnUnit(1, SCORCHER_TYPE, 200 + demoRng() * 40, 60, demoRng);
  if (bi1 !== NO_UNIT) {
    unit(bi1).target = mi;
  }
  const bi2 = spawnUnit(1, CRUISER_TYPE, 200 + demoRng() * 40, 100, demoRng);
  if (bi2 !== NO_UNIT) {
    unit(bi2).target = mi;
  }
}

function demoCarrier() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, DRONE_TYPE, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoDisruptor() {
  for (let i = 0; i < 8; i++) {
    const a = demoRng() * 6.283,
      r = 80 + demoRng() * 60;
    spawnUnit(1, DRONE_TYPE, Math.cos(a) * r, Math.sin(a) * r, demoRng);
  }
}

function demoArcer() {
  for (let i = 0; i < 6; i++) {
    spawnUnit(1, DRONE_TYPE, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10), demoRng);
  }
}

function demoTeleporter() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, FIGHTER_TYPE, 250 + (demoRng() - 0.5) * 100, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoLancer(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, CRUISER_TYPE, 250, (i - 1) * 80, demoRng);
  }
  if (mi !== NO_UNIT) {
    unit(mi).x = -200;
  }
}

function demoSweepBeam(mi: UnitIndex) {
  if (mi !== NO_UNIT) {
    unit(mi).cooldown = 0;
  }
  for (let i = 0; i < 6; i++) {
    const angle = ((i - 2.5) / 5) * 1.2;
    spawnUnit(1, DRONE_TYPE, 200 + Math.cos(angle) * 40, Math.sin(angle) * 120, demoRng);
  }
}

function demoFocusBeam() {
  const ti = spawnUnit(1, FIGHTER_TYPE, 200, 0, demoRng);
  if (ti !== NO_UNIT) {
    unit(ti).hp = unit(ti).maxHp;
  }
  for (let i = 0; i < 2; i++) {
    spawnUnit(1, DRONE_TYPE, 250, (i === 0 ? -1 : 1) * 100, demoRng);
  }
}

function demoFlagship(mi: UnitIndex) {
  if (mi !== NO_UNIT) {
    unit(mi).cooldown = 0;
  }
  for (let i = 0; i < 6; i++) {
    spawnUnit(1, DRONE_TYPE, 250 + demoRng() * 80, (demoRng() - 0.5) * 200, demoRng);
  }
}

function demoCarpetBomber(mi: UnitIndex) {
  for (let i = 0; i < 8; i++) {
    const a = demoRng() * 6.283;
    const r = 120 + demoRng() * 40;
    const ei = spawnUnit(1, DRONE_TYPE, Math.cos(a) * r, Math.sin(a) * r, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoHomingLauncher(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, FIGHTER_TYPE, 250 + (demoRng() - 0.5) * 100, (i - 1) * 60, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoBastion() {
  for (let i = 0; i < 3; i++) {
    const a = ((i + 1) / 4) * Math.PI * 2;
    const ai = spawnUnit(0, FIGHTER_TYPE, Math.cos(a) * 70, Math.sin(a) * 70, demoRng);
    if (ai !== NO_UNIT) {
      unit(ai).hp = 5;
    }
  }
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, DRONE_TYPE, 200 + demoRng() * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoAmplifier() {
  const fi1 = spawnUnit(0, FIGHTER_TYPE, -60, -40, demoRng);
  if (fi1 !== NO_UNIT) {
    unit(fi1).hp = 5;
  }
  const fi2 = spawnUnit(0, FIGHTER_TYPE, -60, 40, demoRng);
  if (fi2 !== NO_UNIT) {
    unit(fi2).hp = 7;
  }
  spawnUnit(0, DRONE_TYPE, -40, 0, demoRng);
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, DRONE_TYPE, 200 + demoRng() * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoScrambler() {
  spawnUnit(0, FIGHTER_TYPE, -80, -50, demoRng);
  spawnUnit(0, FIGHTER_TYPE, -80, 50, demoRng);
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, DRONE_TYPE, 50 + demoRng() * 40, (demoRng() - 0.5) * 100, demoRng);
  }
  spawnUnit(1, FIGHTER_TYPE, 70, -40, demoRng);
  spawnUnit(1, FIGHTER_TYPE, 70, 40, demoRng);
}

function demoCatalyst() {
  spawnUnit(0, DRONE_TYPE, -50, -60, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, -20, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, 20, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, 60, demoRng);
  spawnUnit(0, FIGHTER_TYPE, -70, 0, demoRng);
  spawnUnit(1, DRONE_TYPE, 200, -40, demoRng);
  spawnUnit(1, DRONE_TYPE, 200, 0, demoRng);
  spawnUnit(1, DRONE_TYPE, 200, 40, demoRng);
}

export function demoDefault(t: UnitType) {
  let cnt: number;
  if (t.shape === 8) {
    cnt = 2;
  } else {
    cnt = 4;
  }
  for (let i = 0; i < cnt; i++) {
    spawnUnit(1, DRONE_TYPE, 200 + demoRng() * 100, (demoRng() - 0.5) * 200, demoRng);
  }
}

export const demoByFlag: Record<DemoFlag, (mi: UnitIndex) => void> = {
  swarm: (mi) => demoDroneSwarm(mi),
  carpet: (mi) => demoCarpetBomber(mi),
  homing: (mi) => demoHomingLauncher(mi),
  burst: (mi) => demoBurstFighter(mi),
  heals: () => demoHealer(),
  reflects: (mi) => demoReflector(mi),
  spawns: () => demoCarrier(),
  emp: () => demoDisruptor(),
  chain: () => demoArcer(),
  teleports: () => demoTeleporter(),
  rams: (mi) => demoLancer(mi),
  sweep: (mi) => demoSweepBeam(mi),
  beam: () => demoFocusBeam(),
  broadside: (mi) => demoFlagship(mi),
  shields: () => demoBastion(),
  amplifies: () => demoAmplifier(),
  scrambles: () => demoScrambler(),
  catalyzes: () => demoCatalyst(),
};
