import { batch } from '@preact/signals';
import { cam, setAutoFollow } from '../input/camera.ts';
import type { MeleeResult } from '../melee-tracker.ts';
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
import type { BattleResult, FleetSetup, MothershipVariant, ProductionState } from '../types-fleet.ts';
import { toggleCodex } from './codex/codex-logic.ts';
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

const DEFAULT_ENEMY_SETUP: FleetSetup = { variant: 0, slots: [] };

let currentEnemySetup: FleetSetup = DEFAULT_ENEMY_SETUP;
let currentEnemyArchName = '';

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

export function startBattle(variant: MothershipVariant) {
  const setup = buildFleetFromShop(variant);
  state.gameState = 'play';
  resetCam();
  composeVisible$.value = false;
  resultData$.value = null;
  showPlayUI();
  seedRng(uniqueSeed());
  const productions = initBattleProduction(rng, setup, currentEnemySetup);
  onBattleStart(productions);
}

export function startMelee() {
  state.gameState = 'play';
  resetCam();
  showPlayUI();
  seedRng(uniqueSeed());
  const numTeams = 2 + Math.floor(rng() * (MAX_TEAMS - 1));
  const setups = Array.from({ length: numTeams }, () => generateEnemySetup(rng, 1).setup);
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

export function startNewRun() {
  resetRun();
  initShop();
  seedRng(uniqueSeed());
  const info = getRunInfo();
  const round = info?.round ?? 1;
  initShopRound(createRng(uniqueSeed()), round);
  generateEnemy(round);
  goToCompose(false);
}

export function advanceRound() {
  if (!isRunActive()) {
    return;
  }
  const info = getRunInfo();
  const round = info?.round ?? 1;
  initShopRound(createRng(uniqueSeed()), round);
  generateEnemy(round);
  goToCompose(true);
}

export function _resetGameControl() {
  seedCounter = 0;
  currentEnemySetup = DEFAULT_ENEMY_SETUP;
  currentEnemyArchName = '';
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
