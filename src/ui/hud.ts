import { POOL_UNITS } from '../constants.ts';
import { poolCounts, unitPool } from '../pools.ts';
import { bases, gameMode } from '../state.ts';

export function updateHUD(displayFps: number) {
  let ca = 0,
    cb = 0;
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unitPool[i]!;
    if (!u.alive) continue;
    if (u.team === 0) ca++;
    else cb++;
  }
  document.getElementById('cA')!.textContent = '' + ca;
  document.getElementById('cB')!.textContent = '' + cb;
  document.getElementById('pN')!.textContent = '' + (poolCounts.particleCount + poolCounts.projectileCount);
  document.getElementById('fps')!.textContent = '' + displayFps;
  if (gameMode === 2) {
    document.getElementById('bA')!.textContent = (((bases[0].hp / bases[0].maxHp) * 100) | 0) + '%';
    document.getElementById('bB')!.textContent = (((bases[1].hp / bases[1].maxHp) * 100) | 0) + '%';
  }
}
