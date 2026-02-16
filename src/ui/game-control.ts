import { cam } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import { state } from '../state.ts';
// NOTE: codex.ts → game-control.ts の逆方向 import は循環依存になるため禁止
import { initCodexDOM, toggleCodex } from './codex.ts';
import {
  DOM_ID_BTN_START,
  DOM_ID_CODEX_BTN,
  DOM_ID_CODEX_CLOSE,
  DOM_ID_CODEX_MENU_BTN,
  DOM_ID_CONTROLS,
  DOM_ID_HUD,
  DOM_ID_MENU,
  DOM_ID_MINIMAP,
  DOM_ID_SPD_VALUE,
  DOM_ID_SPEED,
} from './dom-ids.ts';

let elMenu: HTMLElement | null = null;
let elHud: HTMLElement | null = null;
let elCodexBtn: HTMLElement | null = null;
let elMinimap: HTMLElement | null = null;
let elControls: HTMLElement | null = null;
let elSpeed: HTMLElement | null = null;
let elSpdValue: HTMLElement | null = null;

function setSpd(v: number) {
  state.timeScale = v;
  for (const b of document.querySelectorAll<HTMLElement>('.sbtn')) {
    b.classList.toggle('active', Number.parseFloat(b.dataset.spd || '') === v);
  }
  if (elSpdValue) elSpdValue.textContent = `${v}x`;
}

function startGame() {
  state.gameState = 'play';
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
  if (elMenu) elMenu.style.display = 'none';
  if (elHud) elHud.style.display = 'block';
  if (elCodexBtn) elCodexBtn.style.display = 'block';
  if (elMinimap) elMinimap.style.display = 'block';
  if (elControls) elControls.style.display = 'block';
  if (elSpeed) elSpeed.style.display = 'flex';
  initUnits();
}

function handleCodexToggle() {
  toggleCodex();
  if (state.gameState === 'menu') {
    if (elMenu) elMenu.style.display = state.codexOpen ? 'none' : 'flex';
  }
  if (elCodexBtn && state.gameState === 'play') {
    elCodexBtn.style.display = state.codexOpen ? 'none' : 'block';
  }
}

function handlePlayKeydown(e: KeyboardEvent) {
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    stepSpd(-1);
    e.preventDefault();
  } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    stepSpd(1);
    e.preventDefault();
  } else if (e.code === 'Digit1') {
    setSpd(speeds[0] ?? unreachable(0));
    e.preventDefault();
  } else if (e.code === 'Digit2') {
    setSpd(speeds[1] ?? unreachable(1));
    e.preventDefault();
  } else if (e.code === 'Digit3') {
    setSpd(speeds[2] ?? unreachable(2));
    e.preventDefault();
  }
}

const speeds = [1, 2, 4];

function unreachable(idx: number): never {
  throw new RangeError(`Invalid speed index: ${idx}`);
}

function stepSpd(dir: number) {
  const i = speeds.indexOf(state.timeScale);
  const def = speeds.indexOf(1);
  if (i < 0) {
    setSpd(speeds[def] ?? unreachable(def));
  } else if (dir < 0) {
    if (i > 0) setSpd(speeds[i - 1] ?? unreachable(i - 1));
  } else if (i < speeds.length - 1) setSpd(speeds[i + 1] ?? unreachable(i + 1));
}

export function initUI() {
  elMenu = document.getElementById(DOM_ID_MENU);
  elHud = document.getElementById(DOM_ID_HUD);
  elCodexBtn = document.getElementById(DOM_ID_CODEX_BTN);
  elMinimap = document.getElementById(DOM_ID_MINIMAP);
  elControls = document.getElementById(DOM_ID_CONTROLS);
  elSpeed = document.getElementById(DOM_ID_SPEED);
  elSpdValue = document.getElementById(DOM_ID_SPD_VALUE);

  const elBtnStart = document.getElementById(DOM_ID_BTN_START);
  const elCodexClose = document.getElementById(DOM_ID_CODEX_CLOSE);
  const elCodexMenuBtn = document.getElementById(DOM_ID_CODEX_MENU_BTN);

  {
    const entries: [string, HTMLElement | null][] = [
      [DOM_ID_BTN_START, elBtnStart],
      [DOM_ID_CODEX_BTN, elCodexBtn],
      [DOM_ID_CODEX_CLOSE, elCodexClose],
      [DOM_ID_CODEX_MENU_BTN, elCodexMenuBtn],
      [DOM_ID_MENU, elMenu],
      [DOM_ID_HUD, elHud],
      [DOM_ID_MINIMAP, elMinimap],
      [DOM_ID_CONTROLS, elControls],
      [DOM_ID_SPEED, elSpeed],
      [DOM_ID_SPD_VALUE, elSpdValue],
    ];
    const missing = entries.filter(([, el]) => !el).map(([id]) => id);
    if (missing.length > 0) {
      throw new Error(`initUI: missing DOM elements: ${missing.join(', ')}`);
    }
  }

  elBtnStart?.addEventListener('click', () => {
    startGame();
  });

  elCodexBtn?.addEventListener('click', () => {
    handleCodexToggle();
  });
  elCodexClose?.addEventListener('click', () => {
    handleCodexToggle();
  });
  elCodexMenuBtn?.addEventListener('click', () => {
    handleCodexToggle();
  });

  for (const btn of document.querySelectorAll<HTMLElement>('.sbtn[data-spd]')) {
    btn.addEventListener('click', () => {
      setSpd(Number.parseFloat(btn.dataset.spd || '1'));
    });
  }

  addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.code === 'Tab' || e.code === 'Escape') && (state.gameState === 'play' || state.gameState === 'menu')) {
      e.preventDefault();
      handleCodexToggle();
    }
    if (state.gameState === 'play') {
      handlePlayKeydown(e);
    }
  });

  initCodexDOM();
}
