import './style.css';

import { cam, initCamera } from './input/camera.ts';
import { initBuffers } from './renderer/buffers.ts';
import { createFBOs } from './renderer/fbo.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { initShaders } from './renderer/shaders.ts';
import { initWebGL, resize } from './renderer/webgl-setup.ts';
import { update } from './simulation/update.ts';
import { state } from './state.ts';
import { initUI } from './ui/game-control.ts';
import { initHUD, updateHUD } from './ui/hud.ts';

// Initialize renderer (order matters)
initWebGL();
initShaders();
createFBOs();
initBuffers();

// Resize handler
addEventListener('resize', () => {
  resize();
  createFBOs();
});

// Initialize UI and input
initUI();
initHUD();
initCamera();
initMinimap();

// Main loop state
let lastTime = 0,
  frameCount = 0,
  fpsTime = 0,
  displayFps = 0;

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
    cam.shakeX = (Math.random() - 0.5) * cam.shake;
    cam.shakeY = (Math.random() - 0.5) * cam.shake;
    cam.shake *= 0.82;
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
    cam.shake = 0;
  }

  if (state.codexOpen) {
    update(dt, t);
    renderFrame(t);
  } else if (state.gameState === 'play') {
    update(dt * state.timeScale, t);
    renderFrame(t);
    updateHUD(displayFps);
    if (frameCount % 2 === 0) drawMinimap();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
