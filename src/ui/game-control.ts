import { cam, onAutoFollowChange, setAutoFollow, toggleAutoFollow } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import { rng, state } from '../state.ts';
// NOTE: codex.ts → game-control.ts の逆方向 import は循環依存になるため禁止
import { initCodexDOM, toggleCodex } from './codex.ts';
import {
  DOM_ID_AUTO_FOLLOW_BTN,
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
import { getElement } from './dom-util.ts';

interface GameControlEls {
  readonly menu: HTMLElement;
  readonly hud: HTMLElement;
  readonly codexBtn: HTMLElement;
  readonly minimap: HTMLElement;
  readonly controls: HTMLElement;
  readonly speed: HTMLElement;
  readonly spdValue: HTMLElement;
  readonly autoFollowBtn: HTMLElement;
}

let _els: GameControlEls | null = null;

function els(): GameControlEls {
  if (!_els) throw new Error('initUI() has not been called');
  return _els;
}

function setSpd(v: number) {
  state.timeScale = v;
  for (const b of document.querySelectorAll<HTMLElement>('.sbtn')) {
    b.classList.toggle('active', Number.parseFloat(b.dataset.spd || '') === v);
  }
  els().spdValue.textContent = `${v}x`;
}

function startGame() {
  state.gameState = 'play';
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
  const d = els();
  d.menu.style.display = 'none';
  d.hud.style.display = 'block';
  d.codexBtn.style.display = 'block';
  d.autoFollowBtn.style.display = 'block';
  d.minimap.style.display = 'block';
  d.controls.style.display = 'block';
  d.speed.style.display = 'flex';
  initUnits(rng);
}

function onCodexToggle() {
  toggleCodex();
  if (state.gameState === 'menu') {
    els().menu.style.display = state.codexOpen ? 'none' : 'flex';
  }
  if (state.gameState === 'play') {
    els().codexBtn.style.display = state.codexOpen ? 'none' : 'block';
  }
  if (state.codexOpen) {
    setAutoFollow(false);
  }
}

function onPlayKeydown(e: KeyboardEvent) {
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    stepSpd(-1);
    e.preventDefault();
  } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    stepSpd(1);
    e.preventDefault();
  } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    const idx = Number(e.code.slice(-1)) - 1;
    setSpd(speeds[idx] ?? unreachable(idx));
    e.preventDefault();
  } else if (e.code === 'KeyF') {
    if (!state.codexOpen) {
      toggleAutoFollow();
      e.preventDefault();
    }
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
  _els = {
    menu: getElement(DOM_ID_MENU),
    hud: getElement(DOM_ID_HUD),
    codexBtn: getElement(DOM_ID_CODEX_BTN),
    minimap: getElement(DOM_ID_MINIMAP),
    controls: getElement(DOM_ID_CONTROLS),
    speed: getElement(DOM_ID_SPEED),
    spdValue: getElement(DOM_ID_SPD_VALUE),
    autoFollowBtn: getElement(DOM_ID_AUTO_FOLLOW_BTN),
  };

  const elBtnStart = getElement(DOM_ID_BTN_START);
  const elCodexClose = getElement(DOM_ID_CODEX_CLOSE);
  const elCodexMenuBtn = getElement(DOM_ID_CODEX_MENU_BTN);

  elBtnStart.addEventListener('click', () => {
    startGame();
  });

  _els.autoFollowBtn.addEventListener('click', () => {
    if (state.gameState === 'play' && !state.codexOpen) {
      toggleAutoFollow();
    }
  });

  _els.codexBtn.addEventListener('click', () => {
    onCodexToggle();
  });
  elCodexClose.addEventListener('click', () => {
    onCodexToggle();
  });
  elCodexMenuBtn.addEventListener('click', () => {
    onCodexToggle();
  });

  for (const btn of document.querySelectorAll<HTMLElement>('.sbtn[data-spd]')) {
    btn.addEventListener('click', () => {
      setSpd(Number.parseFloat(btn.dataset.spd || '1'));
    });
  }

  addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.code === 'Tab' || e.code === 'Escape') && (state.gameState === 'play' || state.gameState === 'menu')) {
      e.preventDefault();
      onCodexToggle();
    }
    if (state.gameState === 'play') {
      onPlayKeydown(e);
    }
  });

  onAutoFollowChange((on) => {
    els().autoFollowBtn.classList.toggle('active', on);
  });

  initCodexDOM();
}
