import './style.css';
import './style-battle.css';

import {
  addEnemyKill,
  advanceBattleElapsed,
  advanceBattleEndTimer,
  getPlayerEnemyKills,
  onBattleEnd,
  resetBattleTracking,
  setInitialPlayerUnits,
  setOnFinalize,
} from './battle-tracker.ts';
import { REF_FPS, SIM_DT } from './constants.ts';
import { drainAccumulator } from './drain-accumulator.ts';
import { countFleetUnits } from './fleet-cost.ts';
import { cam, initCamera, setAutoFollow, updateAutoFollow } from './input/camera.ts';
import { savePrevPositions, setInterpAlpha } from './interpolation.ts';
import type { MeleeResult } from './melee-tracker.ts';
import {
  advanceMeleeElapsed,
  advanceMeleeEndTimer,
  onMeleeEnd,
  resetMeleeTracking,
  setOnMeleeFinalize,
} from './melee-tracker.ts';
import { getUnitHWM, teamUnitCounts } from './pools.ts';
import { createFBOs } from './renderer/fbo.ts';
import { initRenderer } from './renderer/init.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { resize } from './renderer/webgl-setup.ts';
import { decayScreenEffects, resetScreenEffects, screenEffects } from './screen-effects.ts';
import { hotspot, updateHotspot } from './simulation/hotspot.ts';
import { onKillUnitPermanent } from './simulation/spawn.ts';
import { onUnitKilled } from './simulation/squadron.ts';
import type { GameLoopState } from './simulation/update.ts';
import { stepOnce } from './simulation/update.ts';
import { rng, state } from './state.ts';
import type { BattlePhase, BattleResult } from './types.ts';
import { copyTeamCounts } from './types.ts';
import { mountApp } from './ui/App.tsx';
import { syncDemoCamera, updateCodexDemo } from './ui/codex.ts';
import { demoRng } from './ui/codex-demos.ts';
import { getPlayerFleet } from './ui/fleet-compose.ts';
import {
  goToMeleeResult,
  goToResult,
  initUI,
  setOnBattleStart,
  setOnMeleeStart,
  setOnSpectateStart,
} from './ui/game-control.ts';
import {
  hideMothershipHpBar,
  initHUD,
  setupMeleeHUD,
  showMothershipHpBar,
  teardownMeleeHUD,
  updateHUD,
  updateHudRoundInfo,
} from './ui/hud.ts';
import { addKillFeedEntry, initKillFeed } from './ui/kill-feed.ts';

const BASE_SPEED = 0.55;
/** result 状態のスロー再生倍率 */
const AFTERMATH_SPEED = 0.2;

initRenderer();

addEventListener('resize', () => {
  resize();
  createFBOs();
});

mountApp();
initUI();
initHUD();
initKillFeed();
initCamera();
initMinimap();

function handleBattleFinalized(result: BattleResult) {
  gameLoopState.battlePhase = 'aftermath';
  hideMothershipHpBar();
  goToResult(result);
}

function handleMeleeFinalized(result: MeleeResult) {
  gameLoopState.battlePhase = 'aftermath';
  hideMothershipHpBar();
  teardownMeleeHUD();
  goToMeleeResult(result);
}

function handleBattleStart() {
  resetBattleTracking();
  resetScreenEffects();
  const fleet = getPlayerFleet();
  setInitialPlayerUnits(countFleetUnits(fleet));
  gameLoopState.battlePhase = 'battle';
  gameLoopState.activeTeamCount = 2;
  showMothershipHpBar(2);
  updateHudRoundInfo();
}

function handleSpectateStart() {
  resetScreenEffects();
  gameLoopState.battlePhase = 'spectate';
  gameLoopState.activeTeamCount = 2;
  showMothershipHpBar(2);
}

function handleMeleeStart(numTeams: number) {
  resetMeleeTracking(numTeams, copyTeamCounts(teamUnitCounts));
  resetScreenEffects();
  gameLoopState.battlePhase = 'melee';
  gameLoopState.activeTeamCount = numTeams;
  setupMeleeHUD(numTeams);
  showMothershipHpBar(numTeams);
}

setOnFinalize(handleBattleFinalized);
setOnMeleeFinalize(handleMeleeFinalized);
setOnBattleStart(handleBattleStart);
setOnSpectateStart(handleSpectateStart);
setOnMeleeStart(handleMeleeStart);

onKillUnitPermanent((e) => {
  if (state.codexOpen || state.gameState !== 'play') {
    return;
  }
  const ki = e.killerTeam !== undefined ? { team: e.killerTeam, type: e.killerType } : null;
  addKillFeedEntry(e.victimTeam, e.victimType, ki);
  // 敵チーム(1)の撃破をカウント（BATTLE モードのみ）
  if (e.victimTeam === 1 && gameLoopState.battlePhase === 'battle') {
    addEnemyKill();
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
  get codexOpen() {
    return state.codexOpen;
  },
  get reinforcementTimer() {
    return state.reinforcementTimer;
  },
  set reinforcementTimer(v: number) {
    state.reinforcementTimer = v;
  },
  battlePhase: 'spectate' as BattlePhase,
  activeTeamCount: 2,
  updateCodexDemo,
};

function updatePlay(dt: number, t: number) {
  // フリーズタイマーを実 dt で減衰（シミュレーション停止中も進行する）
  decayScreenEffects(dt);

  // フリーズは accumulator のみに作用: シミュレーション時間を蓄積しない。
  // レンダリング・カメラ補間・エフェクト減衰（decayScreenEffects）は通常 dt で継続。
  const effectiveDt = screenEffects.freezeTimer > 0 ? 0 : dt;

  // drainAccumulator は同期ループ: 最初の勝者検知でスナップショットを確定し、
  // battlePhase を 'battleEnding'/'meleeEnding' に遷移。後続 substep での追加キルはスナップショットに反映しない。
  // onBattleEnd / onMeleeEnd は二重呼び出しガード付きのため、コールバック内で直接呼んで安全。
  simAccumulator = drainAccumulator(simAccumulator + effectiveDt * state.timeScale * BASE_SPEED, () => {
    savePrevPositions();
    if (gameLoopState.battlePhase === 'battle') {
      advanceBattleElapsed(SIM_DT);
    } else if (gameLoopState.battlePhase === 'melee') {
      advanceMeleeElapsed(SIM_DT);
    }
    const w = stepOnce(SIM_DT, t, rng, gameLoopState);
    if (w !== null) {
      if (gameLoopState.battlePhase === 'melee') {
        onMeleeEnd(w);
        gameLoopState.battlePhase = 'meleeEnding';
      } else {
        if (w === 'draw') {
          throw new Error('Unexpected draw in non-melee mode');
        }
        onBattleEnd(w, { survivors: teamUnitCounts[0], enemyKills: getPlayerEnemyKills() });
        gameLoopState.battlePhase = 'battleEnding';
      }
    }
  });
  setInterpAlpha(simAccumulator / SIM_DT);
  const bp = gameLoopState.battlePhase;
  if (bp === 'meleeEnding') {
    advanceMeleeEndTimer(dt);
  } else if (bp === 'battleEnding' || bp === 'battle') {
    advanceBattleEndTimer(dt);
  }

  updateHotspot();
  updateAutoFollow(hotspot());
  renderFrame(t);
  updateHUD(displayFps, bp);
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
    setAutoFollow(false);
    demoAccumulator = drainAccumulator(demoAccumulator + dt * BASE_SPEED, () => {
      savePrevPositions();
      stepOnce(SIM_DT, t, demoRng, gameLoopState);
    });
    setInterpAlpha(demoAccumulator / SIM_DT);
    syncDemoCamera();
    renderFrame(t);
  } else if (state.gameState === 'play') {
    updatePlay(dt, t);
  } else if (state.gameState === 'result') {
    simAccumulator = drainAccumulator(simAccumulator + dt * AFTERMATH_SPEED * BASE_SPEED, () => {
      savePrevPositions();
      stepOnce(SIM_DT, t, rng, gameLoopState);
    });
    setInterpAlpha(simAccumulator / SIM_DT);
    renderFrame(t);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
