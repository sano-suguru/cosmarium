import { color } from '../colors.ts';
import { MINIMAP_MAX, POOL_UNITS, WORLD_SIZE } from '../constants.ts';
import { cam, setAutoFollow } from '../input/camera.ts';
import { unit } from '../pools.ts';
import { unitType } from '../unit-types.ts';
import { minimapBuffer, minimapData, mmVAO, writeSlots } from './buffers.ts';
import { minimapProgram } from './shaders.ts';
import { gl, viewport } from './webgl-setup.ts';

let mmDiv: HTMLElement | null = null;
let minimapInstanceCount = 0;

function writeMinimap(
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
  writeSlots(minimapData, minimapInstanceCount * 9, x, y, sizeX, r, g, b, a, sizeY, shape);
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
    setAutoFollow(false);
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

function drawViewport(S: number, W: number, H: number, dpr: number) {
  const vw = W / dpr / cam.z / (2 * WORLD_SIZE);
  const vh = H / dpr / cam.z / (2 * WORLD_SIZE);
  const cx = cam.x * S,
    cy = cam.y * S;
  const lw = 0.008;
  writeMinimap(cx, cy + vh, vw, lw, 1, 1, 1, 0.2, 1);
  writeMinimap(cx, cy - vh, vw, lw, 1, 1, 1, 0.2, 1);
  writeMinimap(cx - vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);
  writeMinimap(cx + vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);
}

export function drawMinimap() {
  if (!mmDiv || !mmDiv.clientWidth) return;
  minimapInstanceCount = 0;
  const S = 1.0 / WORLD_SIZE;
  const dpr = viewport.dpr;
  const W = viewport.W,
    H = viewport.H;

  writeMinimap(0, 0, 1, 0, 0, 0.02, 0.06, 0.85, 1);

  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    const c = color(u.type, u.team);
    const size = Math.max(0.008, unitType(u.type).size * S * 1.5);
    writeMinimap(u.x * S, u.y * S, size, 0, c[0], c[1], c[2], 0.7, 1);
  }

  drawViewport(S, W, H, dpr);

  const mmR = mmDiv.getBoundingClientRect();
  const mmBW = (mmR.width - mmDiv.clientWidth) * 0.5;
  const mmX = ((mmR.left + mmBW) * dpr) | 0;
  const mmY = ((H / dpr - mmR.bottom + mmBW) * dpr) | 0;
  const mmSW = (mmDiv.clientWidth * dpr) | 0;
  const mmSH = (mmDiv.clientHeight * dpr) | 0;
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
