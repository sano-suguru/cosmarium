import { cam } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import {
  gameState,
  setCatalogOpen,
  setGameMode,
  setGameState,
  setTimeScale,
  setWinTeam,
  timeScale,
  winTeam,
} from '../state.ts';
import type { GameMode } from '../types.ts';
import { toggleCat } from './catalog.ts';

function setSpd(v: number) {
  setTimeScale(v);
  document.querySelectorAll('.sbtn').forEach((b) => {
    b.classList.toggle('active', Number.parseFloat(b.textContent || '') === v);
  });
  document.getElementById('spdV')!.textContent = v + 'x';
}

function startGame(mode: GameMode) {
  setGameMode(mode);
  setGameState('play');
  setWinTeam(-1);
  cam.tx = 0;
  cam.ty = 0;
  cam.tz = 1;
  document.getElementById('menu')!.style.display = 'none';
  document.getElementById('hud')!.style.display = 'block';
  document.getElementById('catBtn')!.style.display = 'block';
  document.getElementById('minimap')!.style.display = 'block';
  document.getElementById('controls')!.style.display = 'block';
  document.getElementById('speed')!.style.display = 'flex';
  document.getElementById('win')!.style.display = 'none';
  document.getElementById('baseHP')!.style.display = mode === 2 ? 'block' : 'none';
  var obj = document.getElementById('objective')!;
  obj.style.display = 'block';
  var labels: Record<GameMode, string> = { 0: 'INFINITE WAR', 1: 'ANNIHILATE ALL ENEMIES', 2: 'DESTROY ENEMY BASE' };
  obj.textContent = labels[mode];
  initUnits();
}

export function showWin() {
  setGameState('win');
  document.getElementById('win')!.style.display = 'flex';
  var t = document.getElementById('winText')!;
  t.textContent = winTeam === 0 ? 'CYAN VICTORY' : 'MAGENTA VICTORY';
  t.style.color = winTeam === 0 ? '#0ff' : '#f0f';
}

function backToMenu() {
  setGameState('menu');
  setCatalogOpen(false);
  document.getElementById('catalog')!.classList.remove('open');
  document.getElementById('menu')!.style.display = 'flex';
  var ids = ['hud', 'catBtn', 'minimap', 'controls', 'objective', 'win', 'speed'];
  ids.forEach((id) => {
    document.getElementById(id)!.style.display = 'none';
  });
}

var speeds = [0.2, 0.4, 0.55, 0.75, 1, 1.5, 2.5];

function stepSpd(dir: number) {
  var i = speeds.indexOf(timeScale);
  var def = speeds.indexOf(0.55);
  if (dir < 0) {
    if (i > 0) setSpd(speeds[i - 1]!);
    else if (i < 0) setSpd(speeds[def - 1]!);
  } else if (i >= 0 && i < speeds.length - 1) setSpd(speeds[i + 1]!);
  else if (i < 0) setSpd(speeds[def + 1]!);
}

export function initUI() {
  // Menu buttons
  document.getElementById('btnInfinite')!.addEventListener('click', () => {
    startGame(0);
  });
  document.getElementById('btnAnnihilation')!.addEventListener('click', () => {
    startGame(1);
  });
  document.getElementById('btnBaseAssault')!.addEventListener('click', () => {
    startGame(2);
  });

  // Catalog buttons
  document.getElementById('catBtn')!.addEventListener('click', () => {
    toggleCat();
  });
  document.getElementById('catClose')!.addEventListener('click', () => {
    toggleCat();
  });

  // Win screen
  document.getElementById('btnMenu')!.addEventListener('click', () => {
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
    if ((e.code === 'Tab' || e.code === 'Escape') && gameState === 'play') {
      e.preventDefault();
      toggleCat();
    }
    if (gameState === 'play') {
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
