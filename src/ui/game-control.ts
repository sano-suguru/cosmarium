import { cam } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import { state } from '../state.ts';
import type { GameMode } from '../types.ts';
// NOTE: catalog.ts → game-control.ts の逆方向 import は循環依存になるため禁止
import { closeCatalog, toggleCat } from './catalog.ts';
import {
  DOM_ID_BASE_HP,
  DOM_ID_BTN_ANNIHILATION,
  DOM_ID_BTN_BASE_ASSAULT,
  DOM_ID_BTN_INFINITE,
  DOM_ID_BTN_MENU,
  DOM_ID_CAT_BTN,
  DOM_ID_CAT_CLOSE,
  DOM_ID_CONTROLS,
  DOM_ID_HUD,
  DOM_ID_MENU,
  DOM_ID_MINIMAP,
  DOM_ID_OBJECTIVE,
  DOM_ID_SPD_VALUE,
  DOM_ID_SPEED,
  DOM_ID_WIN,
  DOM_ID_WIN_TEXT,
} from './dom-ids.ts';

function setSpd(v: number) {
  state.timeScale = v;
  document.querySelectorAll('.sbtn').forEach((b) => {
    b.classList.toggle('active', Number.parseFloat(b.textContent || '') === v);
  });
  document.getElementById(DOM_ID_SPD_VALUE)!.textContent = v + 'x';
}

function startGame(mode: GameMode) {
  state.gameMode = mode;
  state.gameState = 'play';
  state.winTeam = -1;
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
  document.getElementById(DOM_ID_MENU)!.style.display = 'none';
  document.getElementById(DOM_ID_HUD)!.style.display = 'block';
  document.getElementById(DOM_ID_CAT_BTN)!.style.display = 'block';
  document.getElementById(DOM_ID_MINIMAP)!.style.display = 'block';
  document.getElementById(DOM_ID_CONTROLS)!.style.display = 'block';
  document.getElementById(DOM_ID_SPEED)!.style.display = 'flex';
  document.getElementById(DOM_ID_WIN)!.style.display = 'none';
  document.getElementById(DOM_ID_BASE_HP)!.style.display = mode === 2 ? 'block' : 'none';
  const obj = document.getElementById(DOM_ID_OBJECTIVE)!;
  obj.style.display = 'block';
  const labels: Record<GameMode, string> = { 0: 'INFINITE WAR', 1: 'ANNIHILATE ALL ENEMIES', 2: 'DESTROY ENEMY BASE' };
  obj.textContent = labels[mode];
  initUnits();
}

export function showWin() {
  closeCatalog();
  state.gameState = 'win';
  document.getElementById(DOM_ID_WIN)!.style.display = 'flex';
  const t = document.getElementById(DOM_ID_WIN_TEXT)!;
  t.textContent = state.winTeam === 0 ? 'CYAN VICTORY' : 'MAGENTA VICTORY';
  t.style.color = state.winTeam === 0 ? '#0ff' : '#f0f';
}

function backToMenu() {
  closeCatalog();
  state.gameState = 'menu';
  document.getElementById(DOM_ID_MENU)!.style.display = 'flex';
  const ids = [DOM_ID_HUD, DOM_ID_CAT_BTN, DOM_ID_MINIMAP, DOM_ID_CONTROLS, DOM_ID_OBJECTIVE, DOM_ID_WIN, DOM_ID_SPEED];
  ids.forEach((id) => {
    document.getElementById(id)!.style.display = 'none';
  });
}

const speeds = [0.2, 0.4, 0.55, 0.75, 1, 1.5, 2.5];

function stepSpd(dir: number) {
  const i = speeds.indexOf(state.timeScale);
  const def = speeds.indexOf(0.55);
  if (dir < 0) {
    if (i > 0) setSpd(speeds[i - 1]!);
    else if (i < 0) setSpd(speeds[def - 1]!);
  } else if (i >= 0 && i < speeds.length - 1) setSpd(speeds[i + 1]!);
  else if (i < 0) setSpd(speeds[def + 1]!);
}

export function initUI() {
  if (import.meta.env.DEV) {
    const ids = [
      DOM_ID_BTN_INFINITE,
      DOM_ID_BTN_ANNIHILATION,
      DOM_ID_BTN_BASE_ASSAULT,
      DOM_ID_CAT_BTN,
      DOM_ID_CAT_CLOSE,
      DOM_ID_BTN_MENU,
    ];
    const missing = ids.filter((id) => !document.getElementById(id));
    if (missing.length > 0) {
      console.warn(`[DEV] initUI: missing DOM elements: ${missing.join(', ')}`);
    }
  }

  // Menu buttons
  document.getElementById(DOM_ID_BTN_INFINITE)!.addEventListener('click', () => {
    startGame(0);
  });
  document.getElementById(DOM_ID_BTN_ANNIHILATION)!.addEventListener('click', () => {
    startGame(1);
  });
  document.getElementById(DOM_ID_BTN_BASE_ASSAULT)!.addEventListener('click', () => {
    startGame(2);
  });

  // Catalog buttons
  document.getElementById(DOM_ID_CAT_BTN)!.addEventListener('click', () => {
    toggleCat();
  });
  document.getElementById(DOM_ID_CAT_CLOSE)!.addEventListener('click', () => {
    toggleCat();
  });

  // Win screen
  document.getElementById(DOM_ID_BTN_MENU)!.addEventListener('click', () => {
    backToMenu();
  });

  // Speed buttons
  document.querySelectorAll<HTMLElement>('.sbtn[data-spd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSpd(Number.parseFloat(btn.dataset.spd || '0.55'));
    });
  });

  // Keyboard shortcuts for catalog and speed
  addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.code === 'Tab' || e.code === 'Escape') && state.gameState === 'play') {
      e.preventDefault();
      toggleCat();
    }
    if (state.gameState === 'play') {
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        stepSpd(-1);
        e.preventDefault();
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        stepSpd(1);
        e.preventDefault();
      }
    }
  });
}
