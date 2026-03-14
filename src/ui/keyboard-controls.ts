import { SPEEDS } from '../constants.ts';
import { onAutoFollowChange, toggleAutoFollow } from '../input/camera.ts';
import { state } from '../state.ts';
import { goToMenu, onCodexToggle, setSpd } from './game-control.ts';
import { autoFollowActive$ } from './signals.ts';

export function handleAutoFollowToggle() {
  if (state.gameState === 'play' && !state.codexOpen) {
    toggleAutoFollow();
  }
}

function onResultKeydown(e: KeyboardEvent) {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (state.codexOpen) {
      onCodexToggle();
    } else {
      goToMenu();
    }
  } else if (e.code === 'Tab') {
    e.preventDefault();
    onCodexToggle();
  }
}

function unreachable(idx: number): never {
  throw new RangeError(`Invalid speed index: ${idx}`);
}

function stepSpd(dir: number) {
  const i = SPEEDS.indexOf(state.timeScale);
  const def = SPEEDS.indexOf(1);
  if (i < 0) {
    setSpd(SPEEDS[def] ?? unreachable(def));
  } else if (dir < 0) {
    if (i > 0) {
      setSpd(SPEEDS[i - 1] ?? unreachable(i - 1));
    }
  } else if (i < SPEEDS.length - 1) {
    setSpd(SPEEDS[i + 1] ?? unreachable(i + 1));
  }
}

function onComposeKeydown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault();
    onCodexToggle();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    if (state.codexOpen) {
      onCodexToggle();
    } else {
      goToMenu();
    }
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
    setSpd(SPEEDS[idx] ?? unreachable(idx));
    e.preventDefault();
  } else if (e.code === 'KeyF') {
    if (!state.codexOpen) {
      toggleAutoFollow();
      e.preventDefault();
    }
  }
}

function onCodexKey(e: KeyboardEvent) {
  if ((e.code === 'Tab' || e.code === 'Escape') && (state.gameState === 'play' || state.gameState === 'menu')) {
    e.preventDefault();
    onCodexToggle();
  }
}

function onKeydown(e: KeyboardEvent) {
  if (state.gameState === 'compose') {
    onComposeKeydown(e);
  } else if (state.gameState === 'result') {
    onResultKeydown(e);
  } else {
    onCodexKey(e);
  }
  if (state.gameState === 'play') {
    onPlayKeydown(e);
  }
}

let initialized = false;

export function initKeyboardControls() {
  if (initialized) {
    return;
  }
  initialized = true;
  addEventListener('keydown', onKeydown);

  onAutoFollowChange((on) => {
    autoFollowActive$.value = on;
  });
}

export function _resetKeyboardControls() {
  if (initialized) {
    removeEventListener('keydown', onKeydown);
  }
  initialized = false;
}
