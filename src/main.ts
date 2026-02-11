import './style.css';

import { initWebGL, resize } from './renderer/webgl-setup.ts';
import { initShaders } from './renderer/shaders.ts';
import { mkFBOs } from './renderer/fbo.ts';
import { initBuffers } from './renderer/buffers.ts';
import { renderFrame } from './renderer/render-pass.ts';
import { initMinimap, drawMinimap } from './renderer/minimap.ts';
import { cam, initCamera } from './input/camera.ts';
import { initUI } from './ui/game-control.ts';
import { updateHUD } from './ui/hud.ts';
import { update } from './simulation/update.ts';
import { gameState, catalogOpen, timeScale } from './state.ts';

// Initialize renderer (order matters)
initWebGL();
initShaders();
mkFBOs();
initBuffers();

// Resize handler
addEventListener('resize', function() { resize(); mkFBOs(); });

// Initialize UI and input
initUI();
initCamera();
initMinimap();

// Main loop state
var lt = 0, fc = 0, ft = 0, df = 0;

function frame(now: number) {
  now *= 0.001;
  var dt = Math.min(now - lt, 0.05);
  lt = now;

  fc++; ft += dt;
  if (ft >= 0.5) { df = fc / ft | 0; fc = 0; ft = 0; }

  var ct = 1 - Math.pow(0.0005, dt);
  cam.x += (cam.tx - cam.x) * ct;
  cam.y += (cam.ty - cam.y) * ct;
  cam.z += (cam.tz - cam.z) * ct;

  if (cam.shk > 0.1) {
    cam.shkx = (Math.random() - 0.5) * cam.shk;
    cam.shky = (Math.random() - 0.5) * cam.shk;
    cam.shk *= 0.82;
  } else {
    cam.shkx = 0; cam.shky = 0; cam.shk = 0;
  }

  if (gameState === 'play') {
    update(dt * timeScale, now);

    renderFrame(now);

    // HUD updates
    if (!catalogOpen) {
      updateHUD(df);
      if (fc % 2 === 0) drawMinimap();
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
