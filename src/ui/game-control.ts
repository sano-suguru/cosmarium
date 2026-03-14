import { batch } from '@preact/signals';
import { cam, setAutoFollow } from '../input/camera.ts';
import type { MeleeResult } from '../melee-tracker.ts';
import { scheduleRound } from '../round-schedule.ts';
import { _resetRunState, endRun, getRunInfo, isRunActive, processRoundEnd, resetRun } from '../run.ts';
import {
  buildFleetFromShop,
  getShopCredits,
  getShopOfferings,
  getShopSlots,
  initShop,
  initShopRound,
  onShopChange,
  rerollOfferings,
} from '../shop.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import { initBattleProduction, initMeleeProduction, initUnits } from '../simulation/init.ts';
import { createRng, rng, seedRng, state } from '../state.ts';
import type { TeamTuple } from '../team.ts';
import { MAX_TEAMS } from '../team.ts';
import type { TimeScale } from '../types.ts';
import {
  type BattleResult,
  EMPTY_FLEET_SETUP,
  type FleetSetup,
  type MothershipVariant,
  type ProductionState,
} from '../types-fleet.ts';
import { toggleCodex } from './codex/codex-logic.ts';
import { FFA_TEAM_COUNT, generateFfaEnemySetups, meleeResultToBattleResult } from './ffa-round.ts';
import { resetVariant } from './fleet-compose/FleetCompose.tsx';
import { updateHudRoundInfo } from './hud/Hud.tsx';
import {
  composeEnemyArchName$,
  composeEnemySetup$,
  composeVisible$,
  playUiVisible$,
  resultData$,
  shopCredits$,
  shopOfferings$,
  shopSlots$,
} from './signals.ts';

let currentEnemySetup: FleetSetup = EMPTY_FLEET_SETUP;
let currentEnemyArchName = '';
let currentFfaEnemySetups: FleetSetup[] = [];

let seedCounter = 0;
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
function syncShopSignals(): void {
  batch(() => {
    shopCredits$.value = getShopCredits();
    shopOfferings$.value = getShopOfferings();
    shopSlots$.value = getShopSlots();
  });
}

let unsubShop: (() => void) | null = null;

export function initGameControl(): void {
  unsubShop?.();
  unsubShop = onShopChange(syncShopSignals);
}

function currentRound(): number {
  const info = getRunInfo();
  if (!info) {
    throw new Error('currentRound: run is not active');
  }
  return info.round;
}

/** ショップリロール。内部 RNG を使用。 */
export function shopReroll(): boolean {
  return rerollOfferings(currentRound());
}

/** 現ラウンドのショップ購入をリセット（スロット全クリア + クレジット・offerings 再生成）。敵艦隊は維持。 */
export function resetCurrentRoundShop(): void {
  initShop();
  initShopRound(createRng(uniqueSeed()), currentRound());
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

function goToCompose(preserveState: boolean) {
  if (state.codexOpen) {
    toggleCodex();
  }
  state.gameState = 'compose';
  hidePlayUI();
  resultData$.value = null;
  if (!preserveState) {
    resetVariant();
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

function enterPlayFromCompose() {
  state.gameState = 'play';
  resetCam();
  composeVisible$.value = false;
  resultData$.value = null;
  showPlayUI();
  seedRng(uniqueSeed());
}

function startBattle(variant: MothershipVariant) {
  const setup = buildFleetFromShop(variant);
  enterPlayFromCompose();
  onBattleStart(initBattleProduction(rng, setup, currentEnemySetup));
}

export function startMelee() {
  state.gameState = 'play';
  resetCam();
  showPlayUI();
  seedRng(uniqueSeed());
  const numTeams = 2 + Math.floor(rng() * (MAX_TEAMS - 1));
  const setups = Array.from({ length: numTeams }, () => generateEnemySetup(rng, 1).setup);
  onMeleeStart(numTeams, initMeleeProduction(rng, setups, numTeams));
}

function startFfa(variant: MothershipVariant) {
  const playerSetup = buildFleetFromShop(variant);
  enterPlayFromCompose();
  onMeleeStart(FFA_TEAM_COUNT, initMeleeProduction(rng, [playerSetup, ...currentFfaEnemySetups], FFA_TEAM_COUNT));
}

export function launchRound(variant: MothershipVariant) {
  const info = getRunInfo();
  if (!info) {
    throw new Error('launchRound called without active run');
  }
  if (info.roundType === 'ffa') {
    startFfa(variant);
  } else {
    startBattle(variant);
  }
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
  if (isRunActive()) {
    goToResult(meleeResultToBattleResult(result));
    return;
  }
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
  initShop();
  updateHudRoundInfo();
  state.gameState = 'menu';
  hidePlayUI();
  composeVisible$.value = false;
  resultData$.value = null;
  resetVariant();
}

function generateEnemy(round: number) {
  const { setup, archetypeName } = generateEnemySetup(rng, round);
  currentEnemySetup = setup;
  currentEnemyArchName = archetypeName;
}

function prepareRoundEnemy(round: number) {
  if (scheduleRound(round).roundType === 'ffa') {
    currentFfaEnemySetups = generateFfaEnemySetups(rng, round);
    currentEnemySetup = EMPTY_FLEET_SETUP;
    currentEnemyArchName = 'FFA 4勢力';
  } else {
    currentFfaEnemySetups = [];
    generateEnemy(round);
  }
}

export function startNewRun() {
  resetRun();
  initShop();
  seedRng(uniqueSeed());
  initShopRound(createRng(uniqueSeed()), 1);
  prepareRoundEnemy(1);
  goToCompose(false);
}

export function advanceRound() {
  if (!isRunActive()) {
    return;
  }
  const info = getRunInfo();
  if (!info) {
    throw new Error('advanceRound called without active run');
  }
  initShopRound(createRng(uniqueSeed()), info.round);
  prepareRoundEnemy(info.round);
  goToCompose(true);
}

export function _resetGameControl() {
  seedCounter = 0;
  currentEnemySetup = EMPTY_FLEET_SETUP;
  currentEnemyArchName = '';
  currentFfaEnemySetups = [];
  onBattleStart = throwBattleStart;
  onSpectateStart = () => undefined;
  onMeleeStart = () => {
    throw new Error('setOnMeleeStart() must be called before melee launch');
  };
  unsubShop?.();
  unsubShop = null;
  state.gameState = 'menu';
  state.codexOpen = false;
  _resetRunState();
  initShop();
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
