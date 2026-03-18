import { batch } from '@preact/signals';
import { cam, setAutoFollow } from '../input/camera.ts';
import { EMPTY_FLEET_SETUP } from '../mothership-defs.ts';
import { _resetRunState, endRun, getRunInfo, isRunActive, resetRun } from '../run.ts';
import {
  buildFleetFromShop,
  getShopCredits,
  getShopOfferings,
  getShopPurchaseBlocks,
  getShopSlots,
  initShop,
  initShopRound,
  onShopChange,
} from '../shop.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import { initBattleProduction, initBonusField, initMeleeProduction, initUnits } from '../simulation/init.ts';
import { createRng, rng, seedRng, state } from '../state.ts';
import type { TeamTuple } from '../team.ts';
import { MAX_TEAMS } from '../team.ts';
import type { TimeScale, UnitTypeIndex } from '../types.ts';
import type { FleetSetup, ProductionState } from '../types-fleet.ts';
import { toggleCodex } from './codex/codex-logic.ts';
import { getSelectedMothershipType, resetMothershipType, setMothershipType } from './fleet-compose/FleetCompose.tsx';
import { updateHudRoundInfo } from './hud/Hud.tsx';
import { _resetMothershipSelect } from './mothership-select/MothershipSelect.tsx';
import { prepareRoundEnemy } from './round-enemy.ts';
import {
  composeEnemyArchName$,
  composeEnemySetup$,
  composePhase$,
  playUiVisible$,
  resultData$,
  shopCredits$,
  shopOfferings$,
  shopPurchaseBlocks$,
  shopSlots$,
} from './signals.ts';

let currentEnemySetup: FleetSetup = EMPTY_FLEET_SETUP;
let currentEnemyArchName = '';
let currentFfaEnemySetups: FleetSetup[] = [];
let currentFfaTeamCount = 0;

let seedCounter = 0;
type GameCallbacks = {
  battle: (productions: [ProductionState, ProductionState]) => void;
  spectate: () => void;
  melee: (numTeams: number, productions: TeamTuple<ProductionState>) => void;
  bonus: (production: ProductionState, bonusInfo: { totalHp: number }) => void;
};

function throwNotReady(): never {
  throw new Error('setCallbacks() must be called before launch');
}

let onBattleStart: GameCallbacks['battle'] = throwNotReady;
let onSpectateStart: GameCallbacks['spectate'] = throwNotReady;
let onMeleeStart: GameCallbacks['melee'] = throwNotReady;
let onBonusStart: GameCallbacks['bonus'] = throwNotReady;

export function setCallbacks(cbs: GameCallbacks) {
  onBattleStart = cbs.battle;
  onSpectateStart = cbs.spectate;
  onMeleeStart = cbs.melee;
  onBonusStart = cbs.bonus;
}

function syncShopSignals(): void {
  batch(() => {
    shopCredits$.value = getShopCredits();
    shopOfferings$.value = getShopOfferings();
    shopSlots$.value = getShopSlots();
    shopPurchaseBlocks$.value = getShopPurchaseBlocks();
  });
}
let unsubShop: (() => void) | null = null;
export function initGameControl(): void {
  unsubShop?.();
  unsubShop = onShopChange(syncShopSignals);
}
function uniqueSeed(): number {
  return ((Date.now() ^ (performance.now() * 1000)) + ++seedCounter) >>> 0;
}
export function resetCurrentRoundShop(): void {
  const info = getRunInfo();
  if (!info) {
    throw new Error('resetCurrentRoundShop: run is not active');
  }
  initShop();
  initShopRound(createRng(uniqueSeed()), info.round, info.pendingBonusCredits, getSelectedMothershipType());
}
function resetCam() {
  cam.targetX = 0;
  cam.targetY = 0;
  cam.targetZ = 1;
}
function goToCompose() {
  if (state.codexOpen) {
    toggleCodex();
  }
  state.gameState = 'compose';
  playUiVisible$.value = false;
  resultData$.value = null;
  composeEnemySetup$.value = currentEnemySetup;
  composeEnemyArchName$.value = currentEnemyArchName;
  composePhase$.value = 'fleet';
}

export function startSpectate() {
  state.gameState = 'play';
  resetCam();
  playUiVisible$.value = true;
  initUnits(rng);
  onSpectateStart();
}

function enterPlayFromCompose() {
  state.gameState = 'play';
  resetCam();
  composePhase$.value = null;
  resultData$.value = null;
  playUiVisible$.value = true;
  seedRng(uniqueSeed());
}
function startBattle(mothershipType: UnitTypeIndex) {
  const setup = buildFleetFromShop(mothershipType);
  enterPlayFromCompose();
  onBattleStart(initBattleProduction(rng, setup, currentEnemySetup));
}

export function startMelee() {
  state.gameState = 'play';
  resetCam();
  playUiVisible$.value = true;
  seedRng(uniqueSeed());
  const numTeams = 2 + Math.floor(rng() * (MAX_TEAMS - 1));
  const setups = Array.from({ length: numTeams }, () => generateEnemySetup(rng, 1).setup);
  onMeleeStart(numTeams, initMeleeProduction(rng, setups, numTeams));
}

function startFfa(mothershipType: UnitTypeIndex) {
  const playerSetup = buildFleetFromShop(mothershipType);
  enterPlayFromCompose();
  onMeleeStart(
    currentFfaTeamCount,
    initMeleeProduction(rng, [playerSetup, ...currentFfaEnemySetups], currentFfaTeamCount),
  );
}

function startBonus(mothershipType: UnitTypeIndex) {
  const setup = buildFleetFromShop(mothershipType);
  enterPlayFromCompose();
  const bonusInfo = initBonusField(rng, setup);
  onBonusStart(bonusInfo.playerProduction, { totalHp: bonusInfo.totalHp });
}

export function launchRound(mothershipType: UnitTypeIndex) {
  const info = getRunInfo();
  if (!info) {
    throw new Error('launchRound called without active run');
  }
  if (info.roundType === 'ffa') {
    startFfa(mothershipType);
  } else if (info.roundType === 'bonus') {
    startBonus(mothershipType);
  } else {
    startBattle(mothershipType);
  }
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
  playUiVisible$.value = false;
  composePhase$.value = null;
  resultData$.value = null;
  resetMothershipType();
}

function applyRoundEnemy(round: number) {
  const s = prepareRoundEnemy(round, rng);
  currentEnemyArchName = s.archName;
  currentEnemySetup = EMPTY_FLEET_SETUP;
  currentFfaEnemySetups = [];
  currentFfaTeamCount = 0;
  switch (s.roundType) {
    case 'battle':
      currentEnemySetup = s.enemySetup;
      break;
    case 'ffa':
      currentFfaEnemySetups = s.setups;
      currentFfaTeamCount = s.teamCount;
      break;
    case 'bonus':
      break;
  }
}

export function startNewRun() {
  resetRun();
  initShop();
  resetMothershipType();
  seedRng(uniqueSeed());
  state.gameState = 'compose';
  composePhase$.value = 'mothership';
}

export function confirmMothership(mothershipType: UnitTypeIndex) {
  setMothershipType(mothershipType);
  _resetMothershipSelect();
  initShopRound(createRng(uniqueSeed()), 1, 0, mothershipType);
  applyRoundEnemy(1);
  goToCompose();
}

export function advanceRound() {
  if (!isRunActive()) {
    return;
  }
  const info = getRunInfo();
  if (!info) {
    throw new Error('advanceRound called without active run');
  }
  initShopRound(createRng(uniqueSeed()), info.round, info.pendingBonusCredits, getSelectedMothershipType());
  applyRoundEnemy(info.round);
  goToCompose();
}

export function _resetGameControl() {
  seedCounter = 0;
  currentEnemySetup = EMPTY_FLEET_SETUP;
  currentEnemyArchName = '';
  currentFfaEnemySetups = [];
  currentFfaTeamCount = 0;
  onBattleStart = throwNotReady;
  onSpectateStart = throwNotReady;
  onMeleeStart = throwNotReady;
  onBonusStart = throwNotReady;
  unsubShop?.();
  unsubShop = null;
  composePhase$.value = null;
  _resetMothershipSelect();
  state.gameState = 'menu';
  state.codexOpen = false;
  _resetRunState();
  initShop();
}

export function onCodexToggle() {
  toggleCodex();
  if (state.gameState === 'compose' && !state.codexOpen) {
    composeEnemySetup$.value = currentEnemySetup;
    composeEnemyArchName$.value = currentEnemyArchName;
  }
  if (state.codexOpen) {
    setAutoFollow(false);
  }
}

export function setSpd(v: TimeScale) {
  state.timeScale = v;
}
