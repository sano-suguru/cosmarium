import { getColor } from '../colors.ts';
import { MINIMAP_MAX, POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { cam } from '../input/camera.ts';
import { getUnit } from '../pools.ts';
import { asteroids, bases, getAsteroid, state } from '../state.ts';
import { TEAMS } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { minimapBuffer, minimapData, mmVAO } from './buffers.ts';
import { minimapProgram } from './shaders.ts';
import { gl, viewport } from './webgl-setup.ts';

let mmDiv: HTMLElement | null = null;
let minimapInstanceCount = 0;

function writeMinimapInstance(
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
  r: number,
  g: number,
  b: number,
  a: number,
  shape: number,
) {
  if (minimapInstanceCount >= MINIMAP_MAX) return;
  const B = minimapInstanceCount * 9;
  minimapData[B] = x;
  minimapData[B + 1] = y;
  minimapData[B + 2] = sizeX;
  minimapData[B + 3] = r;
  minimapData[B + 4] = g;
  minimapData[B + 5] = b;
  minimapData[B + 6] = a;
  minimapData[B + 7] = sizeY;
  minimapData[B + 8] = shape;
  minimapInstanceCount++;
}

export function initMinimap() {
  mmDiv = document.getElementById('minimap');
  if (!mmDiv) {
    throw new Error('initMinimap: missing DOM element: minimap');
  }
  const div = mmDiv;
  div.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const rect = div.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = rect.width,
      ch = rect.height;
    cam.targetX = (mx / cw) * (WORLD_SIZE * 2) - WORLD_SIZE;
    cam.targetY = WORLD_SIZE - (my / ch) * (WORLD_SIZE * 2);
    cam.targetZ = 1;
  });
  div.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
}

export function drawMinimap() {
  if (!mmDiv || !mmDiv.clientWidth) return;
  minimapInstanceCount = 0;
  const S = 1.0 / WORLD_SIZE;
  const W = viewport.W,
    H = viewport.H;

  // Background
  writeMinimapInstance(0, 0, 1, 0, 0, 0.02, 0.06, 0.85, 1);

  // Asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const a = getAsteroid(i);
    writeMinimapInstance(a.x * S, a.y * S, Math.max(0.008, a.radius * S), 0, 0.31, 0.235, 0.157, 0.4, 0);
  }

  // Bases
  if (state.gameMode === 2) {
    for (const tm of TEAMS) {
      const b = bases[tm];
      writeMinimapInstance(
        b.x * S,
        b.y * S,
        0.05,
        0,
        tm === 0 ? 0 : 1,
        tm === 0 ? 0.784 : 0.392,
        tm === 0 ? 1 : 0.784,
        0.6,
        0,
      );
    }
  }

  // Units
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    const c = getColor(u.type, u.team);
    const size = Math.max(0.008, getUnitType(u.type).size * S * 1.5);
    writeMinimapInstance(u.x * S, u.y * S, size, 0, c[0], c[1], c[2], 0.7, 1);
  }

  // Camera viewport frame
  const vw = W / cam.z / (2 * WORLD_SIZE);
  const vh = H / cam.z / (2 * WORLD_SIZE);
  const cx = cam.x * S,
    cy = cam.y * S;
  const lw = 0.008;
  writeMinimapInstance(cx, cy + vh, vw, lw, 1, 1, 1, 0.2, 1);
  writeMinimapInstance(cx, cy - vh, vw, lw, 1, 1, 1, 0.2, 1);
  writeMinimapInstance(cx - vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);
  writeMinimapInstance(cx + vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);

  const mmR = mmDiv.getBoundingClientRect();
  const mmBW = (mmR.width - mmDiv.clientWidth) * 0.5;
  const mmX = (mmR.left + mmBW) | 0;
  const mmY = (H - mmR.bottom + mmBW) | 0;
  const mmSW = mmDiv.clientWidth;
  const mmSH = mmDiv.clientHeight;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(mmX, mmY, mmSW, mmSH);
  gl.viewport(mmX, mmY, mmSW, mmSH);

  gl.useProgram(minimapProgram);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.bindBuffer(gl.ARRAY_BUFFER, minimapBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, minimapData.subarray(0, minimapInstanceCount * 9), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(mmVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, minimapInstanceCount);
  gl.bindVertexArray(null);

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, W, H);
}
