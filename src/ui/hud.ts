import { POOL_UNITS } from '../constants.ts';
import { getUnit, poolCounts } from '../pools.ts';
import { bases, state } from '../state.ts';
import { devWarn } from './dev-overlay.ts';
import {
  DOM_ID_BASE_A,
  DOM_ID_BASE_B,
  DOM_ID_COUNT_A,
  DOM_ID_COUNT_B,
  DOM_ID_FPS,
  DOM_ID_PARTICLE_NUM,
} from './dom-ids.ts';

let _hudInitialized = false;
let elCountA: HTMLElement | null = null;
let elCountB: HTMLElement | null = null;
let elParticleNum: HTMLElement | null = null;
let elFps: HTMLElement | null = null;
let elBaseA: HTMLElement | null = null;
let elBaseB: HTMLElement | null = null;

/** Initialize HUD DOM node cache (call after DOM ready) */
export function initHUD() {
  elCountA = document.getElementById(DOM_ID_COUNT_A);
  elCountB = document.getElementById(DOM_ID_COUNT_B);
  elParticleNum = document.getElementById(DOM_ID_PARTICLE_NUM);
  elFps = document.getElementById(DOM_ID_FPS);
  elBaseA = document.getElementById(DOM_ID_BASE_A);
  elBaseB = document.getElementById(DOM_ID_BASE_B);

  {
    const missing = [
      [DOM_ID_COUNT_A, elCountA],
      [DOM_ID_COUNT_B, elCountB],
      [DOM_ID_PARTICLE_NUM, elParticleNum],
      [DOM_ID_FPS, elFps],
      [DOM_ID_BASE_A, elBaseA],
      [DOM_ID_BASE_B, elBaseB],
    ]
      .filter(([, el]) => !el)
      .map(([id]) => id);
    if (missing.length > 0) {
      throw new Error(`initHUD: missing DOM elements: ${missing.join(', ')}`);
    }
  }
  _hudInitialized = true;
}

export function updateHUD(displayFps: number) {
  if (!elCountA || !elCountB || !elParticleNum || !elFps || !elBaseA || !elBaseB) {
    if (!_hudInitialized) {
      devWarn('[DEV] updateHUD: initHUD() has not been called');
    }
    return;
  }

  let ca = 0,
    cb = 0;
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    if (u.team === 0) ca++;
    else cb++;
  }
  elCountA.textContent = `${ca}`;
  elCountB.textContent = `${cb}`;
  elParticleNum.textContent = `${poolCounts.particleCount + poolCounts.projectileCount}`;
  elFps.textContent = `${displayFps}`;
  if (state.gameMode === 2) {
    elBaseA.textContent = `${((bases[0].hp / bases[0].maxHp) * 100) | 0}%`;
    elBaseB.textContent = `${((bases[1].hp / bases[1].maxHp) * 100) | 0}%`;
  }
}
