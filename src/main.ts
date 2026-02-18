import './style.css';

import { BASE_SPEED, REF_FPS } from './constants.ts';
import { cam, initCamera, setAutoFollow, updateAutoFollowCamera } from './input/camera.ts';
import { initBuffers } from './renderer/buffers.ts';
import { createFBOs } from './renderer/fbo.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { initShaders } from './renderer/shaders.ts';
import { initWebGL, resize } from './renderer/webgl-setup.ts';
import { getHotspot, updateHotspot } from './simulation/hotspot.ts';
import { update } from './simulation/update.ts';
import { rng, state } from './state.ts';
import { isCodexDemoUnit, updateCodexDemo } from './ui/codex.ts';
import { initUI } from './ui/game-control.ts';
import { initHUD, updateHUD } from './ui/hud.ts';

// Init order matters: WebGL context → shader compile → FBOs → vertex buffers
initWebGL();
initShaders();
createFBOs();
initBuffers();

addEventListener('resize', () => {
  resize();
  createFBOs();
});

initUI();
initHUD();
initCamera();
initMinimap();

let lastTime = 0,
  frameCount = 0,
  fpsTime = 0,
  displayFps = 0;

/** state のミュータブルフィールドを GameLoopState として公開する薄いラッパー */
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
  isCodexDemoUnit,
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

  if (state.codexOpen) {
    setAutoFollow(false);
    // デモは timeScale を無視して常に 1x で再生（速度設定に依存しない一貫した表示のため）
    update(dt * BASE_SPEED, t, rng, gameLoopState);
    renderFrame(t);
  } else if (state.gameState === 'play') {
    const scaledDt = dt * state.timeScale * BASE_SPEED;
    update(scaledDt, t, rng, gameLoopState);
    updateHotspot();
    updateAutoFollowCamera(getHotspot());
    renderFrame(t);
    updateHUD(displayFps);
    if (frameCount % 2 === 0) drawMinimap();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
