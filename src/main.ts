import './style.css';

import {
  addEnemyKill,
  advanceBattleElapsed,
  advanceBattleEndTimer,
  getPlayerEnemyKills,
  onBattleEnd,
} from './battle-tracker.ts';
import { recordBonusKill } from './bonus-round.ts';
import { REF_FPS, SIM_DT } from './constants.ts';
import { drainAccumulator } from './drain-accumulator.ts';
import { addShake, cam, initCamera, updateAutoFollow } from './input/camera.ts';
import { savePrevPositions, setInterpAlpha } from './interpolation.ts';
import { advanceMeleeElapsed, advanceMeleeEndTimer, onMeleeEnd } from './melee-tracker.ts';
import { installPhaseCallbacks } from './phase-callbacks.ts';
import { getUnitHWM, teamUnitCounts } from './pools.ts';
import { initRenderer } from './renderer/init.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { resize } from './renderer/webgl-setup.ts';
import { decayScreenEffects, screenEffects } from './screen-effects.ts';
import { hotspot, updateHotspot } from './simulation/hotspot.ts';
import { emptyProductions } from './simulation/production.ts';
import { onKillUnitPermanent } from './simulation/spawn-hooks.ts';
import { onUnitKilled } from './simulation/squadron.ts';
import type { GameLoopState } from './simulation/update.ts';
import { stepOnce, stepWorld } from './simulation/update.ts';
import { rng, state } from './state.ts';
import type { Team } from './team.ts';
import { TEAM0, TEAM1 } from './team.ts';
import type { BattlePhase } from './types.ts';
import { isBattleLikePhase } from './types.ts';
import { mountApp } from './ui/App.tsx';
import { syncDemoCamera, updateCodexDemo } from './ui/codex/codex-logic.ts';
import { demoRng } from './ui/codex-demos.ts';
import { initGameControl } from './ui/game-control.ts';
import { updateHUD, updateProductionHud } from './ui/hud/Hud.tsx';
import { initKeyboardControls } from './ui/keyboard-controls.ts';
import { addKillFeedEntry } from './ui/kill-feed/KillFeed.tsx';

const BASE_SPEED = 0.55;
/** result 状態のスロー再生倍率 */
const AFTERMATH_SPEED = 0.2;
/** Codex デモは常に2チーム（team 0 vs team 1） */
const CODEX_DEMO_TEAMS = 2;
/** Codex デモ中は shake 不要（no-op） */
// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for demo shake
const noShake = () => {};

initRenderer();

addEventListener('resize', resize);

mountApp();
initGameControl();
initKeyboardControls();
initCamera();
initMinimap();

onKillUnitPermanent((e) => {
  if (state.gameState !== 'play') {
    return;
  }
  const ki = e.killerTeam !== undefined ? { team: e.killerTeam, type: e.killerType } : null;
  addKillFeedEntry(e.victimTeam, e.victimType, ki);
  if (e.victimTeam === TEAM1) {
    if (gameLoopState.battlePhase === 'battle') {
      addEnemyKill();
    } else if (gameLoopState.battlePhase === 'bonus' && gameLoopState.bonusData) {
      recordBonusKill(gameLoopState.bonusData, e.victimType);
      addEnemyKill();
    }
  }
  onUnitKilled(e.victimSquadronIdx, e.victim, getUnitHWM());
});

let lastTime = 0,
  frameCount = 0,
  fpsTime = 0,
  displayFps = 0;

let prevCodexOpen = false;
let prevGameState = state.gameState;

/** シミュレーション用 accumulator — 実経過時間を蓄積し SIM_DT 刻みで stepOnce を呼ぶ */
let simAccumulator = 0;
/** codex デモ用 accumulator（ゲーム本編とは独立） */
let demoAccumulator = 0;

const gameLoopState: GameLoopState = {
  get reinforcementTimer() {
    return state.reinforcementTimer;
  },
  set reinforcementTimer(v: number) {
    state.reinforcementTimer = v;
  },
  battlePhase: 'spectate' as BattlePhase,
  activeTeamCount: 2,
  productions: emptyProductions(),
  bonusData: null,
  phaseElapsed: 0,
};

installPhaseCallbacks(gameLoopState);

function handleWinnerDetected(w: Team | 'draw') {
  const bp = gameLoopState.battlePhase;
  if (bp === 'melee') {
    onMeleeEnd(w);
    gameLoopState.battlePhase = 'meleeEnding';
    return;
  }
  if (!isBattleLikePhase(bp)) {
    throw new Error(`handleWinnerDetected called in unexpected phase: ${bp}`);
  }
  if (w === 'draw') {
    throw new Error('Unexpected draw in non-melee mode');
  }
  onBattleEnd(w, { survivors: teamUnitCounts[TEAM0], enemyKills: getPlayerEnemyKills() });
  gameLoopState.battlePhase = 'battleEnding';
}

function updatePlay(dt: number, t: number) {
  decayScreenEffects(dt);
  // フリーズ中は accumulator 更新のみ停止（レンダリング・エフェクト減衰は継続）
  const effectiveDt = screenEffects.freezeTimer > 0 ? 0 : dt;
  simAccumulator = drainAccumulator(simAccumulator + effectiveDt * state.timeScale * BASE_SPEED, () => {
    savePrevPositions();
    gameLoopState.phaseElapsed += SIM_DT;
    if (isBattleLikePhase(gameLoopState.battlePhase)) {
      advanceBattleElapsed(SIM_DT);
    } else if (gameLoopState.battlePhase === 'melee') {
      advanceMeleeElapsed(SIM_DT);
    }
    const w = stepOnce(SIM_DT, rng, gameLoopState, addShake);
    if (w !== null) {
      handleWinnerDetected(w);
    }
  });
  setInterpAlpha(simAccumulator / SIM_DT);
  const bp = gameLoopState.battlePhase;
  if (bp === 'meleeEnding') {
    advanceMeleeEndTimer(dt);
  } else if (bp === 'battleEnding') {
    advanceBattleEndTimer(dt);
  }

  updateHotspot();
  updateAutoFollow(hotspot());
  renderFrame(t);
  updateHUD(displayFps, bp);
  if (isBattleLikePhase(bp)) {
    updateProductionHud(gameLoopState.productions[TEAM0]);
  }
  if (frameCount % 2 === 0) {
    drawMinimap();
  }
}

function frame(now: number) {
  const t = now * 0.001;
  const dt = Math.min(t - lastTime, 0.05);
  lastTime = t;

  frameCount++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    displayFps = (frameCount / fpsTime) | 0;
    frameCount = 0;
    fpsTime = 0;
  }

  const ct = 1 - 0.0005 ** dt;
  cam.x += (cam.targetX - cam.x) * ct;
  cam.y += (cam.targetY - cam.y) * ct;
  cam.z += (cam.targetZ - cam.z) * ct;

  if (cam.shake > 0.1) {
    // 純粋なビジュアルエフェクトなので seeded PRNG ではなく Math.random() を使用（決定性に影響しない）
    cam.shakeX = (Math.random() - 0.5) * cam.shake;
    cam.shakeY = (Math.random() - 0.5) * cam.shake;
    cam.shake *= 0.82 ** (dt * REF_FPS);
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
    cam.shake = 0;
  }

  if (state.codexOpen !== prevCodexOpen || state.gameState !== prevGameState) {
    simAccumulator = 0;
    demoAccumulator = 0;
    prevCodexOpen = state.codexOpen;
    prevGameState = state.gameState;
  }

  if (state.codexOpen) {
    demoAccumulator = drainAccumulator(demoAccumulator + dt * BASE_SPEED, () => {
      savePrevPositions();
      stepWorld(SIM_DT, demoRng, CODEX_DEMO_TEAMS, noShake);
      updateCodexDemo(SIM_DT);
    });
    setInterpAlpha(demoAccumulator / SIM_DT);
    syncDemoCamera();
    renderFrame(t);
  } else if (state.gameState === 'play') {
    updatePlay(dt, t);
  } else if (state.gameState === 'result') {
    simAccumulator = drainAccumulator(simAccumulator + dt * AFTERMATH_SPEED * BASE_SPEED, () => {
      savePrevPositions();
      stepOnce(SIM_DT, rng, gameLoopState, addShake);
    });
    setInterpAlpha(simAccumulator / SIM_DT);
    renderFrame(t);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
