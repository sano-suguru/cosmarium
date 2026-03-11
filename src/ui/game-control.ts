import { SPEEDS } from '../constants.ts';
import { cam, onAutoFollowChange, setAutoFollow, toggleAutoFollow } from '../input/camera.ts';
import type { MeleeResult } from '../melee-tracker.ts';
import { _resetRunState, endRun, isRunActive, processRoundEnd, resetRun } from '../run.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import { initBattleProduction, initMeleeProduction, initUnits } from '../simulation/init.ts';
import { rng, seedRng, state } from '../state.ts';
import type { TeamTuple } from '../team.ts';
import { MAX_TEAMS } from '../team.ts';
import type { TimeScale } from '../types.ts';
import type { BattleResult, FleetSetup, ProductionState } from '../types-fleet.ts';
// NOTE: codex → game-control の逆方向 import は循環依存になるため禁止
import { toggleCodex } from './codex/codex-logic.ts';
import { resetComposeCounts } from './fleet-compose/FleetCompose.tsx';
import { updateHudRoundInfo } from './hud/Hud.tsx';
import {
  autoFollowActive$,
  composeEnemyArchName$,
  composeEnemySetup$,
  composeVisible$,
  playUiVisible$,
  resultData$,
} from './signals.ts';

const DEFAULT_ENEMY_SETUP: FleetSetup = { variant: 0, slots: [] };

let currentEnemySetup: FleetSetup = DEFAULT_ENEMY_SETUP;
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

type BattleStartCb = (productions: [ProductionState, ProductionState]) => void;
type SpectateStartCb = () => void;
type MeleeStartCb = (numTeams: number, productions: TeamTuple<ProductionState>) => void;
const throwBattleStart: BattleStartCb = () => {
  throw new Error('setOnBattleStart() must be called before battle launch');
};
let onBattleStart: BattleStartCb = throwBattleStart;
let onSpectateStart: SpectateStartCb = () => undefined;
let onMeleeStart: MeleeStartCb = () => undefined;

export function setOnBattleStart(cb: BattleStartCb) {
  onBattleStart = cb;
}

export function setOnSpectateStart(cb: SpectateStartCb) {
  onSpectateStart = cb;
}

export function setOnMeleeStart(cb: MeleeStartCb) {
  onMeleeStart = cb;
}

function showPlayUI() {
  playUiVisible$.value = true;
}

function hidePlayUI() {
  playUiVisible$.value = false;
}

function resetCam() {
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
}

function goToCompose(preserveFleet: boolean) {
  if (state.codexOpen) {
    toggleCodex();
  }
  state.gameState = 'compose';
  hidePlayUI();
  resultData$.value = null;
  if (!preserveFleet) {
    resetComposeCounts();
  }
  composeEnemySetup$.value = currentEnemySetup;
  composeEnemyArchName$.value = currentEnemyArchName;
  composeVisible$.value = true;
}

export function startSpectate() {
  state.gameState = 'play';
  resetCam();
  showPlayUI();
  initUnits(rng);
  onSpectateStart();
}

export function startBattle(setup: FleetSetup) {
  state.gameState = 'play';
  resetCam();
  composeVisible$.value = false;
  resultData$.value = null;
  showPlayUI();
  seedRng(uniqueSeed());
  // 両チームとも母艦のみスポーン — ユニットはタイマー駆動で生産
  const productions = initBattleProduction(rng, setup, currentEnemySetup);
  onBattleStart(productions);
}

export function startMelee() {
  state.gameState = 'play';
  resetCam();
  showPlayUI();
  seedRng(uniqueSeed());
  const numTeams = 2 + Math.floor(rng() * (MAX_TEAMS - 1));
  const setups = Array.from({ length: numTeams }, () => generateEnemySetup(rng).setup);
  const productions = initMeleeProduction(rng, setups, numTeams);
  onMeleeStart(numTeams, productions);
}

export function goToResult(result: BattleResult) {
  const outcome = processRoundEnd(result);
  state.gameState = 'result';
  hidePlayUI();

  if (outcome.type === 'runComplete') {
    resultData$.value = { type: 'run', runResult: outcome.runResult };
  } else {
    resultData$.value = { type: 'round', roundResult: outcome.roundResult, runStatus: outcome.status };
  }
}

export function goToMeleeResult(result: MeleeResult) {
  state.gameState = 'result';
  hidePlayUI();
  resultData$.value = { type: 'melee', meleeResult: result };
}

export function goToMenu() {
  if (state.codexOpen) {
    toggleCodex();
  }
  if (isRunActive()) {
    endRun();
  }
  updateHudRoundInfo();
  state.gameState = 'menu';
  hidePlayUI();
  composeVisible$.value = false;
  resultData$.value = null;
  resetComposeCounts();
}

function generateEnemy() {
  const { setup, archetypeName } = generateEnemySetup(rng);
  currentEnemySetup = setup;
  currentEnemyArchName = archetypeName;
}

export function startNewRun() {
  resetRun();
  generateEnemy();
  goToCompose(false);
}

export function advanceRound() {
  if (!isRunActive()) {
    return;
  }
  generateEnemy();
  goToCompose(true);
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetGameControl() {
  seedCounter = 0;
  currentEnemySetup = DEFAULT_ENEMY_SETUP;
  currentEnemyArchName = '';
  onBattleStart = throwBattleStart;
  onSpectateStart = () => undefined;
  onMeleeStart = () => {
    throw new Error('setOnMeleeStart() must be called before melee launch');
  };
  state.gameState = 'menu';
  state.codexOpen = false;
  _resetRunState();
}

export function onCodexToggle() {
  toggleCodex();
  if (state.gameState === 'compose') {
    if (state.codexOpen) {
      composeVisible$.value = false;
    } else {
      composeEnemySetup$.value = currentEnemySetup;
      composeEnemyArchName$.value = currentEnemyArchName;
      composeVisible$.value = true;
    }
  }
  if (state.codexOpen) {
    setAutoFollow(false);
  }
}

export function setSpd(v: TimeScale) {
  state.timeScale = v;
}

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

export function initKeyboardControls() {
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
    autoFollowActive$.value = on;
  });
}
