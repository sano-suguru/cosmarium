import { POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { getUnit } from '../pools.ts';
import { state } from '../state.ts';
import type { Team } from '../types.ts';
import { TEAMS } from '../types.ts';
import { spawnUnit } from './spawn.ts';

// Reinforcement spawn probability distribution:
// Each wave spawns 5 Drones + 2 Fighters as baseline, then rolls r∈[0,1)
// for conditional spawns. Ranges overlap intentionally so multiple types
// can spawn in the same wave. Low-count gates (cnt<50/40) ensure rare
// powerful units appear only when the team is losing.

interface ReinforcementEntry {
  readonly type: number;
  readonly spread: number;
  readonly condition: (r: number, cnt: number) => boolean;
}

const REINFORCEMENT_TABLE: readonly ReinforcementEntry[] = [
  { type: 2, spread: 80, condition: (r) => r < 0.5 }, // Bomber — 50%
  { type: 3, spread: 80, condition: (r) => r < 0.4 }, // Cruiser — 40%
  { type: 4, spread: 80, condition: (r, cnt) => cnt < 50 && r < 0.1 }, // Flagship — 10% (losing)
  { type: 5, spread: 60, condition: (r) => r > 0.2 && r < 0.35 }, // Healer — 15%
  { type: 6, spread: 60, condition: (r) => r > 0.35 && r < 0.5 }, // Reflector — 15%
  { type: 7, spread: 80, condition: (r, cnt) => cnt < 40 && r < 0.18 }, // Carrier — 18% (losing)
  { type: 8, spread: 80, condition: (r) => r > 0.5 && r < 0.65 }, // Sniper — 15%
  { type: 9, spread: 50, condition: (r) => r > 0.65 && r < 0.77 }, // Ram — 12%
  { type: 10, spread: 60, condition: (r) => r > 0.3 && r < 0.45 }, // Missile — 15%
  { type: 11, spread: 60, condition: (r) => r > 0.77 && r < 0.87 }, // EMP — 10%
  { type: 12, spread: 60, condition: (r) => r > 0.12 && r < 0.25 }, // Beam Frig — 13%
  { type: 13, spread: 60, condition: (r) => r > 0.87 && r < 0.95 }, // Teleporter — 8%
  { type: 14, spread: 60, condition: (r) => r > 0.95 }, // Chain Bolt — 5%
];

function countAlive(team: Team): number {
  let cnt = 0;
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (u.alive && u.team === team) cnt++;
  }
  return cnt;
}

function spawnWave(team: Team, cnt: number) {
  const cx = team === 0 ? -WORLD_SIZE * 0.6 : WORLD_SIZE * 0.6;
  const cy = (Math.random() - 0.5) * WORLD_SIZE;
  const r = Math.random();
  const s = (tp: number, spread: number) => {
    spawnUnit(team, tp, cx + (Math.random() - 0.5) * spread, cy + (Math.random() - 0.5) * spread);
  };
  for (let i = 0; i < 5; i++) s(0, 100); // Drone ×5 — always
  for (let i = 0; i < 2; i++) s(1, 80); // Fighter ×2 — always
  for (let i = 0; i < REINFORCEMENT_TABLE.length; i++) {
    const entry = REINFORCEMENT_TABLE[i];
    if (entry?.condition(r, cnt)) {
      s(entry.type, entry.spread);
    }
  }
}

export function reinforce(dt: number) {
  if (state.gameMode === 1) return;
  state.reinforcementTimer += dt;
  if (state.reinforcementTimer < 2.5) return;
  state.reinforcementTimer = 0;
  const lim = state.gameMode === 2 ? 100 : 130;
  for (const team of TEAMS) {
    const cnt = countAlive(team);
    if (cnt < lim) spawnWave(team, cnt);
  }
}
