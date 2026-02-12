import './style.css';

import { cam, initCamera } from './input/camera.ts';
import { initBuffers } from './renderer/buffers.ts';
import { mkFBOs } from './renderer/fbo.ts';
import { drawMinimap, initMinimap } from './renderer/minimap.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { initShaders } from './renderer/shaders.ts';
import { initWebGL, resize } from './renderer/webgl-setup.ts';
import { update } from './simulation/update.ts';
import { catalogOpen, gameState, timeScale } from './state.ts';
import { initUI } from './ui/game-control.ts';
import { updateHUD } from './ui/hud.ts';

// Initialize renderer (order matters)
initWebGL();
initShaders();
mkFBOs();
initBuffers();

// Resize handler
addEventListener('resize', () => {
  resize();
  mkFBOs();
});

// Initialize UI and input
initUI();
initCamera();
initMinimap();

// Main loop state
let lt = 0,
  fc = 0,
  ft = 0,
  df = 0;

function frame(now: number) {
  const t = now * 0.001;
  const dt = Math.min(t - lt, 0.05);
  lt = t;

  fc++;
  ft += dt;
  if (ft >= 0.5) {
    df = (fc / ft) | 0;
    fc = 0;
    ft = 0;
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

  if (gameState === 'play') {
    update(dt * timeScale, t);

    renderFrame(t);

    // HUD updates
    if (!catalogOpen) {
      updateHUD(df);
      if (fc % 2 === 0) drawMinimap();
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
