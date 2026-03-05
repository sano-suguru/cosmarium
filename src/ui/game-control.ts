import { DEFAULT_BUDGET } from '../fleet-cost.ts';
import { cam, onAutoFollowChange, setAutoFollow, toggleAutoFollow } from '../input/camera.ts';
import type { MeleeResult } from '../melee-tracker.ts';
import { initBattle, initMelee, initUnits } from '../simulation/init.ts';
import { rng, seedRng, state } from '../state.ts';
import type { BattleResult, FleetComposition } from '../types.ts';
import { MAX_TEAMS } from '../types.ts';
import { hideResult, reopenResult, showMeleeResult, showResult } from './battle-result.ts';
// NOTE: codex.ts → game-control.ts の逆方向 import は循環依存になるため禁止
import { initCodexDOM, toggleCodex } from './codex.ts';
import {
  DOM_ID_AUTO_FOLLOW_BTN,
  DOM_ID_BTN_MELEE,
  DOM_ID_BTN_SPECTATE,
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
import { getPlayerFleet, hideCompose, initComposeDOM, resetCounts, showCompose } from './fleet-compose.ts';

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
  if (!_els) {
    throw new Error('initUI() has not been called');
  }
  return _els;
}

function setSpd(v: number) {
  state.timeScale = v;
  for (const b of document.querySelectorAll<HTMLElement>('.sbtn')) {
    b.classList.toggle('active', Number.parseFloat(b.dataset.spd || '') === v);
  }
  els().spdValue.textContent = `${v}x`;
}

let currentEnemyFleet: FleetComposition = [];
let currentEnemyArchName = '';

let seedCounter = 0;
/**
 * mulberry32 用の一意シードを生成する。
 * `>>> 0` は 64bit float の Date.now() を無符号32ビットに正規化する
 * （mulberry32 は内部で `seed | 0` により32bit整数として処理するため）。
 * seedCounter で ms 精度の衝突を防止。
 */
function uniqueSeed(): number {
  return ((Date.now() ^ (performance.now() * 1000)) + ++seedCounter) >>> 0;
}

type TransitionCb = () => void;
type MeleeStartCb = (numTeams: number) => void;
const throwBattleStart: TransitionCb = () => {
  throw new Error('setOnBattleStart() must be called before battle launch');
};
let onBattleStart: TransitionCb = throwBattleStart;
let onStartCompose: TransitionCb = () => undefined;
let onSpectateStart: TransitionCb = () => undefined;
let onMeleeStart: MeleeStartCb = () => undefined;

export function setOnBattleStart(cb: TransitionCb) {
  onBattleStart = cb;
}

export function setOnStartCompose(cb: TransitionCb) {
  onStartCompose = cb;
}

export function setOnSpectateStart(cb: TransitionCb) {
  onSpectateStart = cb;
}

export function setOnMeleeStart(cb: MeleeStartCb) {
  onMeleeStart = cb;
}

function showPlayUI() {
  const d = els();
  d.hud.style.display = 'block';
  d.codexBtn.style.display = 'block';
  d.autoFollowBtn.style.display = 'block';
  d.minimap.style.display = 'block';
  d.controls.style.display = 'block';
  d.speed.style.display = 'flex';
}

function hidePlayUI() {
  const d = els();
  d.hud.style.display = 'none';
  d.codexBtn.style.display = 'none';
  d.autoFollowBtn.style.display = 'none';
  d.minimap.style.display = 'none';
  d.controls.style.display = 'none';
  d.speed.style.display = 'none';
}

function resetCam() {
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
}

/** START → compose: 敵を生成して編成画面へ */
export function goToCompose(preserveFleet: boolean) {
  if (state.codexOpen) {
    toggleCodex();
  }
  state.gameState = 'compose';
  els().menu.style.display = 'none';
  hidePlayUI();
  hideResult();
  if (!preserveFleet) {
    resetCounts();
  }
  showCompose(currentEnemyFleet, currentEnemyArchName);
}

/** SPECTATE → play: 従来の無限戦闘 */
function startSpectate() {
  state.gameState = 'play';
  resetCam();
  els().menu.style.display = 'none';
  showPlayUI();
  initUnits(rng);
  onSpectateStart();
}

/** LAUNCH → play: バトル開始 */
function startBattle(playerFleet: FleetComposition) {
  state.gameState = 'play';
  resetCam();
  hideCompose();
  hideResult();
  showPlayUI();
  seedRng(uniqueSeed());
  initBattle(playerFleet, currentEnemyFleet, rng);
  onBattleStart();
}

/** MELEE → play: N勢力乱戦開始 */
const MELEE_TOTAL_BUDGET = DEFAULT_BUDGET * 2; // 2-team battle と同等の総量

function startMelee() {
  state.gameState = 'play';
  resetCam();
  els().menu.style.display = 'none';
  showPlayUI();
  seedRng(uniqueSeed());
  const numTeams = 2 + Math.floor(rng() * (MAX_TEAMS - 1)); // 2〜MAX_TEAMS
  const perTeamBudget = Math.round(MELEE_TOTAL_BUDGET / numTeams);
  initMelee(numTeams, perTeamBudget, rng);
  onMeleeStart(numTeams);
}

/** REMATCH: 同じ編成・敵で再戦（シードのみ変更） */
export function rematch() {
  startBattle(getPlayerFleet());
}

/** play → result: バトル終了後の結果表示 */
export function goToResult(result: BattleResult) {
  state.gameState = 'result';
  hidePlayUI();
  showResult(result);
}

/** play → result: MELEE 結果表示 */
export function goToMeleeResult(result: MeleeResult) {
  state.gameState = 'result';
  hidePlayUI();
  showMeleeResult(result);
}

/** result/play → menu */
export function goToMenu() {
  if (state.codexOpen) {
    toggleCodex();
  }
  state.gameState = 'menu';
  hidePlayUI();
  hideCompose();
  hideResult();
  resetCounts();
  els().menu.style.display = 'flex';
}

export function setEnemyFleet(fleet: FleetComposition, archName: string) {
  currentEnemyFleet = fleet;
  currentEnemyArchName = archName;
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetGameControl() {
  seedCounter = 0;
  currentEnemyFleet = [];
  currentEnemyArchName = '';
  onBattleStart = throwBattleStart;
  onStartCompose = () => undefined;
  onSpectateStart = () => undefined;
  onMeleeStart = () => undefined;
}

function onCodexToggle() {
  toggleCodex();
  if (state.gameState === 'menu') {
    els().menu.style.display = state.codexOpen ? 'none' : 'flex';
  }
  if (state.gameState === 'compose') {
    if (state.codexOpen) {
      hideCompose();
    } else {
      showCompose(currentEnemyFleet, currentEnemyArchName);
    }
  }
  if (state.gameState === 'play') {
    els().codexBtn.style.display = state.codexOpen ? 'none' : 'block';
  }
  if (state.gameState === 'result') {
    if (state.codexOpen) {
      hideResult();
    } else {
      // Codex 閉じ → result パネル再表示
      reopenResult();
    }
  }
  if (state.codexOpen) {
    setAutoFollow(false);
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
    if (i > 0) {
      setSpd(speeds[i - 1] ?? unreachable(i - 1));
    }
  } else if (i < speeds.length - 1) {
    setSpd(speeds[i + 1] ?? unreachable(i + 1));
  }
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
  const elBtnSpectate = getElement(DOM_ID_BTN_SPECTATE);
  const elBtnMelee = getElement(DOM_ID_BTN_MELEE);
  const elCodexClose = getElement(DOM_ID_CODEX_CLOSE);
  const elCodexMenuBtn = getElement(DOM_ID_CODEX_MENU_BTN);

  elBtnStart.addEventListener('click', () => {
    onStartCompose();
  });

  elBtnSpectate.addEventListener('click', () => {
    startSpectate();
  });

  elBtnMelee.addEventListener('click', () => {
    startMelee();
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
    if (
      (e.code === 'Tab' || e.code === 'Escape') &&
      (state.gameState === 'play' || state.gameState === 'menu' || state.gameState === 'compose')
    ) {
      e.preventDefault();
      onCodexToggle();
    } else if (state.gameState === 'result') {
      onResultKeydown(e);
    }
    if (state.gameState === 'play') {
      onPlayKeydown(e);
    }
  });

  onAutoFollowChange((on) => {
    els().autoFollowBtn.classList.toggle('active', on);
  });

  initComposeDOM(startBattle, goToMenu, onCodexToggle);
  initCodexDOM();
}
