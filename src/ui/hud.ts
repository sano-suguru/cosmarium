import { POOL_UNITS } from '../constants.ts';
import { poolCounts, unit } from '../pools.ts';
import { DOM_ID_COUNT_A, DOM_ID_COUNT_B, DOM_ID_FPS, DOM_ID_PARTICLE_NUM } from './dom-ids.ts';
import { getElement } from './dom-util.ts';

interface HudEls {
  readonly countA: HTMLElement;
  readonly countB: HTMLElement;
  readonly particleNum: HTMLElement;
  readonly fps: HTMLElement;
}

let _els: HudEls | null = null;

function els(): HudEls {
  if (!_els) throw new Error('initHUD() has not been called');
  return _els;
}

export function initHUD() {
  _els = {
    countA: getElement(DOM_ID_COUNT_A),
    countB: getElement(DOM_ID_COUNT_B),
    particleNum: getElement(DOM_ID_PARTICLE_NUM),
    fps: getElement(DOM_ID_FPS),
  };
}

export function updateHUD(displayFps: number) {
  const d = els();

  let ca = 0,
    cb = 0;
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    if (u.team === 0) ca++;
    else cb++;
  }
  d.countA.textContent = `${ca}`;
  d.countB.textContent = `${cb}`;
  d.particleNum.textContent = `${poolCounts.particles + poolCounts.projectiles}`;
  d.fps.textContent = `${displayFps}`;
}
