import { POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Team } from '../types.ts';
import { TEAMS } from '../types.ts';
import { unitTypeIndex } from '../unit-types.ts';
import { spawnUnit } from './spawn.ts';

// Reinforcement spawn probability distribution:
// Each wave spawns 8 Drones + 2 Fighters as baseline, then rolls r∈[0,1)
// for conditional spawns. Ranges overlap intentionally so multiple types
// can spawn in the same wave. Low-count gates (cnt<50/40) ensure rare
// powerful units appear only when the team is losing.
// Known overlaps:
//   BASTION (0.45-0.55) × BOMBER (<0.5)     → r∈[0.45,0.5) で同時出現
//   BASTION (0.45-0.55) × REFLECTOR (0.35-0.5) → r∈[0.45,0.5) で同時出現
//   LAUNCHER (0.3-0.45)  × REFLECTOR (0.35-0.5) → r∈[0.35,0.45) で同時出現

interface ReinforcementEntry {
  readonly type: number;
  readonly spread: number;
  readonly condition: (r: number, cnt: number) => boolean;
}

const DRONE = unitTypeIndex('Drone');
const FIGHTER = unitTypeIndex('Fighter');
const BOMBER = unitTypeIndex('Bomber');
const CRUISER = unitTypeIndex('Cruiser');
const FLAGSHIP = unitTypeIndex('Flagship');
const HEALER = unitTypeIndex('Healer');
const REFLECTOR = unitTypeIndex('Reflector');
const CARRIER = unitTypeIndex('Carrier');
const SNIPER = unitTypeIndex('Sniper');
const LANCER = unitTypeIndex('Lancer');
const LAUNCHER = unitTypeIndex('Launcher');
const DISRUPTOR = unitTypeIndex('Disruptor');
const BEAM_FRIG = unitTypeIndex('Beam Frig.');
const TELEPORTER = unitTypeIndex('Teleporter');
const ARCER = unitTypeIndex('Arcer');
const BASTION = unitTypeIndex('Bastion');

const REINFORCEMENT_TABLE: readonly ReinforcementEntry[] = [
  { type: BOMBER, spread: 80, condition: (r) => r < 0.5 }, // 50%
  { type: CRUISER, spread: 80, condition: (r) => r < 0.4 }, // 40%
  { type: FLAGSHIP, spread: 80, condition: (r, cnt) => cnt < 50 && r < 0.1 }, // 10% (losing)
  { type: HEALER, spread: 60, condition: (r) => r > 0.2 && r < 0.35 }, // 15%
  { type: REFLECTOR, spread: 60, condition: (r) => r > 0.35 && r < 0.5 }, // 15%
  { type: CARRIER, spread: 80, condition: (r, cnt) => cnt < 40 && r < 0.18 }, // 18% (losing)
  { type: SNIPER, spread: 80, condition: (r) => r > 0.5 && r < 0.65 }, // 15%
  { type: LANCER, spread: 50, condition: (r) => r > 0.65 && r < 0.77 }, // 12%
  { type: LAUNCHER, spread: 60, condition: (r) => r > 0.3 && r < 0.45 }, // 15%
  { type: DISRUPTOR, spread: 60, condition: (r) => r > 0.77 && r < 0.87 }, // 10%
  { type: BEAM_FRIG, spread: 60, condition: (r) => r > 0.12 && r < 0.25 }, // 13%
  { type: TELEPORTER, spread: 60, condition: (r) => r > 0.87 && r < 0.95 }, // 8%
  { type: ARCER, spread: 60, condition: (r) => r > 0.95 }, // 5%
  { type: BASTION, spread: 60, condition: (r) => r > 0.45 && r < 0.55 }, // 10% (overlaps BOMBER)
];

function countAlive(team: Team): number {
  let cnt = 0;
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (u.alive && u.team === team) cnt++;
  }
  return cnt;
}

function spawnWave(team: Team, cnt: number, rng: () => number) {
  const cx = team === 0 ? -WORLD_SIZE * 0.6 : WORLD_SIZE * 0.6;
  const cy = (rng() - 0.5) * WORLD_SIZE;
  const r = rng();
  const s = (tp: number, spread: number) => {
    spawnUnit(team, tp, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
  };
  for (let i = 0; i < 8; i++) s(DRONE, 100);
  for (let i = 0; i < 2; i++) s(FIGHTER, 80);
  for (let i = 0; i < REINFORCEMENT_TABLE.length; i++) {
    const entry = REINFORCEMENT_TABLE[i];
    if (entry?.condition(r, cnt)) {
      s(entry.type, entry.spread);
    }
  }
}

export interface ReinforcementState {
  reinforcementTimer: number;
}

export function reinforce(dt: number, rng: () => number, rs: ReinforcementState) {
  rs.reinforcementTimer += dt;
  if (rs.reinforcementTimer < 2.5) return;
  rs.reinforcementTimer = 0;
  const lim = 130;
  for (const team of TEAMS) {
    const cnt = countAlive(team);
    if (cnt < lim) spawnWave(team, cnt, rng);
  }
}
