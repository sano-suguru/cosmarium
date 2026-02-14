import { cam } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import { state } from '../state.ts';
import type { GameMode } from '../types.ts';
// NOTE: catalog.ts → game-control.ts の逆方向 import は循環依存になるため禁止
import { closeCatalog, initCatalogDOM, toggleCat } from './catalog.ts';
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

// DOM element cache (populated by initUI)
let elMenu: HTMLElement | null = null;
let elHud: HTMLElement | null = null;
let elCatBtn: HTMLElement | null = null;
let elMinimap: HTMLElement | null = null;
let elControls: HTMLElement | null = null;
let elSpeed: HTMLElement | null = null;
let elSpdValue: HTMLElement | null = null;
let elWin: HTMLElement | null = null;
let elWinText: HTMLElement | null = null;
let elBaseHp: HTMLElement | null = null;
let elObjective: HTMLElement | null = null;

function setSpd(v: number) {
  state.timeScale = v;
  document.querySelectorAll('.sbtn').forEach((b) => {
    b.classList.toggle('active', Number.parseFloat(b.textContent || '') === v);
  });
  if (elSpdValue) elSpdValue.textContent = v + 'x';
}

function startGame(mode: GameMode) {
  state.gameMode = mode;
  state.gameState = 'play';
  state.winTeam = -1;
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
  if (elMenu) elMenu.style.display = 'none';
  if (elHud) elHud.style.display = 'block';
  if (elCatBtn) elCatBtn.style.display = 'block';
  if (elMinimap) elMinimap.style.display = 'block';
  if (elControls) elControls.style.display = 'block';
  if (elSpeed) elSpeed.style.display = 'flex';
  if (elWin) elWin.style.display = 'none';
  if (elBaseHp) elBaseHp.style.display = mode === 2 ? 'block' : 'none';
  if (elObjective) {
    elObjective.style.display = 'block';
    const labels: Record<GameMode, string> = {
      0: 'INFINITE WAR',
      1: 'ANNIHILATE ALL ENEMIES',
      2: 'DESTROY ENEMY BASE',
    };
    elObjective.textContent = labels[mode];
  }
  initUnits();
}

export function showWin() {
  closeCatalog();
  state.gameState = 'win';
  if (elWin) elWin.style.display = 'flex';
  if (elWinText) {
    elWinText.textContent = state.winTeam === 0 ? 'CYAN VICTORY' : 'MAGENTA VICTORY';
    elWinText.style.color = state.winTeam === 0 ? '#0ff' : '#f0f';
  }
}

function backToMenu() {
  closeCatalog();
  state.gameState = 'menu';
  if (elMenu) elMenu.style.display = 'flex';
  const els = [elHud, elCatBtn, elMinimap, elControls, elObjective, elWin, elSpeed];
  for (const el of els) {
    if (el) el.style.display = 'none';
  }
}

const speeds = [0.2, 0.4, 0.55, 0.75, 1, 1.5, 2.5];

function unreachable(idx: number): never {
  throw new RangeError(`Invalid speed index: ${idx}`);
}

function stepSpd(dir: number) {
  const i = speeds.indexOf(state.timeScale);
  const def = speeds.indexOf(0.55);
  if (dir < 0) {
    if (i > 0) setSpd(speeds[i - 1] ?? unreachable(i - 1));
    else if (i < 0) setSpd(speeds[def - 1] ?? unreachable(def - 1));
  } else if (i >= 0 && i < speeds.length - 1) setSpd(speeds[i + 1] ?? unreachable(i + 1));
  else if (i < 0) setSpd(speeds[def + 1] ?? unreachable(def + 1));
}

export function initUI() {
  // Cache DOM elements
  elMenu = document.getElementById(DOM_ID_MENU);
  elHud = document.getElementById(DOM_ID_HUD);
  elCatBtn = document.getElementById(DOM_ID_CAT_BTN);
  elMinimap = document.getElementById(DOM_ID_MINIMAP);
  elControls = document.getElementById(DOM_ID_CONTROLS);
  elSpeed = document.getElementById(DOM_ID_SPEED);
  elSpdValue = document.getElementById(DOM_ID_SPD_VALUE);
  elWin = document.getElementById(DOM_ID_WIN);
  elWinText = document.getElementById(DOM_ID_WIN_TEXT);
  elBaseHp = document.getElementById(DOM_ID_BASE_HP);
  elObjective = document.getElementById(DOM_ID_OBJECTIVE);

  const elBtnInfinite = document.getElementById(DOM_ID_BTN_INFINITE);
  const elBtnAnnihilation = document.getElementById(DOM_ID_BTN_ANNIHILATION);
  const elBtnBaseAssault = document.getElementById(DOM_ID_BTN_BASE_ASSAULT);
  const elCatClose = document.getElementById(DOM_ID_CAT_CLOSE);
  const elBtnMenu = document.getElementById(DOM_ID_BTN_MENU);

  {
    const entries: [string, HTMLElement | null][] = [
      [DOM_ID_BTN_INFINITE, elBtnInfinite],
      [DOM_ID_BTN_ANNIHILATION, elBtnAnnihilation],
      [DOM_ID_BTN_BASE_ASSAULT, elBtnBaseAssault],
      [DOM_ID_CAT_BTN, elCatBtn],
      [DOM_ID_CAT_CLOSE, elCatClose],
      [DOM_ID_BTN_MENU, elBtnMenu],
      [DOM_ID_MENU, elMenu],
      [DOM_ID_HUD, elHud],
      [DOM_ID_MINIMAP, elMinimap],
      [DOM_ID_CONTROLS, elControls],
      [DOM_ID_SPEED, elSpeed],
      [DOM_ID_SPD_VALUE, elSpdValue],
      [DOM_ID_WIN, elWin],
      [DOM_ID_WIN_TEXT, elWinText],
      [DOM_ID_BASE_HP, elBaseHp],
      [DOM_ID_OBJECTIVE, elObjective],
    ];
    const missing = entries.filter(([, el]) => !el).map(([id]) => id);
    if (missing.length > 0) {
      throw new Error(`initUI: missing DOM elements: ${missing.join(', ')}`);
    }
  }

  // Menu buttons
  elBtnInfinite?.addEventListener('click', () => {
    startGame(0);
  });
  elBtnAnnihilation?.addEventListener('click', () => {
    startGame(1);
  });
  elBtnBaseAssault?.addEventListener('click', () => {
    startGame(2);
  });

  // Catalog buttons
  elCatBtn?.addEventListener('click', () => {
    toggleCat();
  });
  elCatClose?.addEventListener('click', () => {
    toggleCat();
  });

  // Win screen
  elBtnMenu?.addEventListener('click', () => {
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

  initCatalogDOM();
}
