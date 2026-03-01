import './style.css';

import { REF_FPS, SIM_DT } from './constants.ts';
import { cam, initCamera, setAutoFollow, updateAutoFollow } from './input/camera.ts';
import { createFBOs } from './renderer/fbo.ts';
import { initRenderer } from './renderer/init.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { resize } from './renderer/webgl-setup.ts';
import { hotspot, updateHotspot } from './simulation/hotspot.ts';
import { onKillUnitPermanent } from './simulation/spawn.ts';
import { stepOnce } from './simulation/update.ts';
import { rng, state } from './state.ts';
import { demoRng, syncDemoCamera, updateCodexDemo } from './ui/codex.ts';
import { initUI } from './ui/game-control.ts';
import { initHUD, updateHUD } from './ui/hud.ts';
import { addKillFeedEntry, initKillFeed } from './ui/kill-feed.ts';

const BASE_SPEED = 0.55;

initRenderer();

addEventListener('resize', () => {
  resize();
  createFBOs();
});

initUI();
initHUD();
initKillFeed();
initCamera();
initMinimap();

onKillUnitPermanent((e) => {
  if (state.codexOpen || state.gameState !== 'play') return;
  const ki = e.killerTeam !== undefined ? { team: e.killerTeam, type: e.killerType } : null;
  addKillFeedEntry(e.victimTeam, e.victimType, ki);
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

const MAX_SIM_STEPS_PER_FRAME = 8;

/**
 * accumulator を消費して固定 dt で stepOnce を呼ぶ。戻り値は残余 accumulator。
 * MAX_SIM_STEPS_PER_FRAME に達した場合は残余を破棄し、シミュレーションの暴走を防ぐ。
 */
function drainAccumulator(initial: number, t: number, rngFn: () => number): number {
  let remaining = initial;
  let steps = 0;
  while (remaining >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
    stepOnce(SIM_DT, t, rngFn, gameLoopState);
    remaining -= SIM_DT;
    steps++;
  }
  // MAX到達で未消化分が残る場合は破棄（フレームスパイク対策: 遅延の蓄積を防止）
  return remaining >= SIM_DT ? 0 : remaining;
}

const gameLoopState = {
  get codexOpen() {
    return state.codexOpen;
  },
  get reinforcementTimer() {
    return state.reinforcementTimer;
  },
  set reinforcementTimer(v: number) {
    state.reinforcementTimer = v;
  },
  updateCodexDemo,
};

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
    demoAccumulator = drainAccumulator(demoAccumulator + dt * BASE_SPEED, t, demoRng);
    syncDemoCamera();
    renderFrame(t);
  } else if (state.gameState === 'play') {
    simAccumulator = drainAccumulator(simAccumulator + dt * state.timeScale * BASE_SPEED, t, rng);
    updateHotspot();
    updateAutoFollow(hotspot());
    renderFrame(t);
    updateHUD(displayFps);
    if (frameCount % 2 === 0) drawMinimap();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
