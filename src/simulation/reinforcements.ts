import { POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { unitPool } from '../pools.ts';
import { state } from '../state.ts';
import type { Team } from '../types.ts';
import { spawnUnit } from './spawn.ts';

// Reinforcement spawn probability distribution:
// Each wave spawns 5 Drones + 2 Fighters as baseline, then rolls r∈[0,1)
// for conditional spawns. Ranges overlap intentionally so multiple types
// can spawn in the same wave. Low-count gates (cnt<50/40) ensure rare
// powerful units appear only when the team is losing.
export function reinforce(dt: number) {
  if (state.gameMode === 1) return;
  state.reinforcementTimer += dt;
  if (state.reinforcementTimer < 2.5) return;
  state.reinforcementTimer = 0;
  for (let ti = 0; ti < 2; ti++) {
    const team = ti as Team;
    let cnt = 0;
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = unitPool[i]!;
      if (u.alive && u.team === team) cnt++;
    }
    const lim = state.gameMode === 2 ? 100 : 130;
    if (cnt < lim) {
      const cx = team === 0 ? -WORLD_SIZE * 0.6 : WORLD_SIZE * 0.6;
      const cy = (Math.random() - 0.5) * WORLD_SIZE;
      const r = Math.random();
      const s = (tp: number, spread: number) => {
        spawnUnit(team, tp, cx + (Math.random() - 0.5) * spread, cy + (Math.random() - 0.5) * spread);
      };
      for (let i = 0; i < 5; i++) s(0, 100); // Drone ×5 — always
      for (let i = 0; i < 2; i++) s(1, 80); // Fighter ×2 — always
      if (r < 0.5) s(2, 80); // Bomber — 50%
      if (r < 0.4) s(3, 80); // Cruiser — 40%
      if (cnt < 50 && r < 0.1) s(4, 80); // Flagship — 10% (only when losing)
      if (r > 0.2 && r < 0.35) s(5, 60); // Healer — 15% [0.20–0.35)
      if (r > 0.35 && r < 0.5) s(6, 60); // Reflector — 15% [0.35–0.50)
      if (cnt < 40 && r < 0.18) s(7, 80); // Carrier — 18% (only when losing)
      if (r > 0.5 && r < 0.65) s(8, 80); // Sniper — 15% [0.50–0.65)
      if (r > 0.65 && r < 0.77) s(9, 50); // Ram — 12% [0.65–0.77)
      if (r > 0.3 && r < 0.45) s(10, 60); // Missile — 15% [0.30–0.45)
      if (r > 0.77 && r < 0.87) s(11, 60); // EMP — 10% [0.77–0.87)
      if (r > 0.12 && r < 0.25) s(12, 60); // Beam Frig — 13% [0.12–0.25)
      if (r > 0.87 && r < 0.95) s(13, 60); // Teleporter — 8% [0.87–0.95)
      if (r > 0.95) s(14, 60); // Chain Bolt — 5% [0.95–1.0)
    }
  }
}
