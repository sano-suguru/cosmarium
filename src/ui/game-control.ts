import {
  winTeam, timeScale, gameState,
  setGameState, setGameMode, setWinTeam, setCatalogOpen, setTimeScale
} from '../state.ts';
import { cam } from '../input/camera.ts';
import { initUnits } from '../simulation/init.ts';
import { toggleCat } from './catalog.ts';
import type { GameMode } from '../types.ts';

export function setSpd(v: number) {
  setTimeScale(v);
  document.querySelectorAll('.sbtn').forEach(function(b) {
    b.classList.toggle('active', parseFloat(b.textContent || '') === v);
  });
  document.getElementById('spdV')!.textContent = v + 'x';
}

export function startGame(mode: GameMode) {
  setGameMode(mode); setGameState('play'); setWinTeam(-1);
  cam.tx = 0; cam.ty = 0; cam.tz = 1;
  document.getElementById('menu')!.style.display = 'none';
  document.getElementById('hud')!.style.display = 'block';
  document.getElementById('catBtn')!.style.display = 'block';
  document.getElementById('minimap')!.style.display = 'block';
  document.getElementById('controls')!.style.display = 'block';
  document.getElementById('speed')!.style.display = 'flex';
  document.getElementById('win')!.style.display = 'none';
  (document.getElementById('baseHP') as HTMLElement).style.display = mode === 2 ? 'block' : 'none';
  var obj = document.getElementById('objective')!;
  obj.style.display = 'block';
  obj.textContent = mode===0 ? 'INFINITE WAR' : mode===1 ? 'ANNIHILATE ALL ENEMIES' : 'DESTROY ENEMY BASE';
  initUnits();
}

export function showWin() {
  setGameState('win');
  document.getElementById('win')!.style.display = 'flex';
  var t = document.getElementById('winText')!;
  t.textContent = winTeam === 0 ? 'CYAN VICTORY' : 'MAGENTA VICTORY';
  (t as HTMLElement).style.color = winTeam === 0 ? '#0ff' : '#f0f';
}

export function backToMenu() {
  setGameState('menu'); setCatalogOpen(false);
  document.getElementById('catalog')!.classList.remove('open');
  document.getElementById('menu')!.style.display = 'flex';
  var ids = ['hud','catBtn','minimap','controls','objective','win','speed'];
  ids.forEach(function(id) { (document.getElementById(id) as HTMLElement).style.display = 'none'; });
}

export function initUI() {
  // Menu buttons
  document.getElementById('btnInfinite')!.addEventListener('click', function() { startGame(0); });
  document.getElementById('btnAnnihilation')!.addEventListener('click', function() { startGame(1); });
  document.getElementById('btnBaseAssault')!.addEventListener('click', function() { startGame(2); });

  // Catalog buttons
  document.getElementById('catBtn')!.addEventListener('click', function() { toggleCat(); });
  document.getElementById('catClose')!.addEventListener('click', function() { toggleCat(); });

  // Win screen
  document.getElementById('btnMenu')!.addEventListener('click', function() { backToMenu(); });

  // Speed buttons
  document.querySelectorAll('.sbtn[data-spd]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setSpd(parseFloat((btn as HTMLElement).dataset.spd || '0.55'));
    });
  });

  // Keyboard shortcuts for catalog and speed
  addEventListener('keydown', function(e: KeyboardEvent) {
    if ((e.code === 'Tab' || e.code === 'Escape') && gameState === 'play') {
      e.preventDefault(); toggleCat();
    }
    if (gameState === 'play') {
      var speeds = [0.2, 0.4, 0.55, 0.75, 1, 1.5, 2.5];
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        var i = speeds.indexOf(timeScale);
        if (i > 0) setSpd(speeds[i - 1]);
        else if (i < 0) setSpd(0.4);
        e.preventDefault();
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        var i = speeds.indexOf(timeScale);
        if (i < speeds.length - 1) setSpd(speeds[i + 1]);
        else if (i < 0) setSpd(0.75);
        e.preventDefault();
      }
    }
  });
}
