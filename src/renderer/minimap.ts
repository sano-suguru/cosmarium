import { gC } from '../colors.ts';
import { MM_MAX, PU, WORLD } from '../constants.ts';
import { cam } from '../input/camera.ts';
import { uP } from '../pools.ts';
import { asteroids, bases, gameMode } from '../state.ts';
import { TYPES } from '../unit-types.ts';
import { mmB, mmD, mmVAO } from './buffers.ts';
import { mmP } from './shaders.ts';
import { gl, viewport } from './webgl-setup.ts';

let mmDiv: HTMLElement;
let mmIc = 0;

function mmW(x: number, y: number, sx: number, sy: number, r: number, g: number, b: number, a: number, sh: number) {
  if (mmIc >= MM_MAX) return;
  const B = mmIc * 9;
  mmD[B] = x;
  mmD[B + 1] = y;
  mmD[B + 2] = sx;
  mmD[B + 3] = r;
  mmD[B + 4] = g;
  mmD[B + 5] = b;
  mmD[B + 6] = a;
  mmD[B + 7] = sy;
  mmD[B + 8] = sh;
  mmIc++;
}

export function initMinimap() {
  mmDiv = document.getElementById('minimap')!;
  mmDiv.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const rect = mmDiv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = rect.width,
      ch = rect.height;
    cam.tx = (mx / cw) * (WORLD * 2) - WORLD;
    cam.ty = WORLD - (my / ch) * (WORLD * 2);
    cam.tz = 1;
  });
  mmDiv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
}

export function drawMinimap() {
  if (!mmDiv.clientWidth) return;
  mmIc = 0;
  const S = 1.0 / WORLD;
  const W = viewport.W,
    H = viewport.H;

  // Background
  mmW(0, 0, 1, 0, 0, 0.02, 0.06, 0.85, 1);

  // Asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!;
    mmW(a.x * S, a.y * S, Math.max(0.008, a.r * S), 0, 0.31, 0.235, 0.157, 0.4, 0);
  }

  // Bases
  if (gameMode === 2) {
    for (let i = 0; i < 2; i++) {
      const b = bases[i]!;
      mmW(b.x * S, b.y * S, 0.05, 0, i === 0 ? 0 : 1, i === 0 ? 0.784 : 0.392, i === 0 ? 1 : 0.784, 0.6, 0);
    }
  }

  // Units
  for (let i = 0; i < PU; i++) {
    const u = uP[i]!;
    if (!u.alive) continue;
    const c = gC(u.type, u.team);
    const sz = Math.max(0.008, TYPES[u.type]!.sz * S * 1.5);
    mmW(u.x * S, u.y * S, sz, 0, c[0], c[1], c[2], 0.7, 1);
  }

  // Camera viewport frame
  const vw = W / cam.z / (2 * WORLD);
  const vh = H / cam.z / (2 * WORLD);
  const cx = cam.x * S,
    cy = cam.y * S;
  const lw = 0.008;
  mmW(cx, cy + vh, vw, lw, 1, 1, 1, 0.2, 1);
  mmW(cx, cy - vh, vw, lw, 1, 1, 1, 0.2, 1);
  mmW(cx - vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);
  mmW(cx + vw, cy, lw, vh + lw, 1, 1, 1, 0.2, 1);

  const mmR = mmDiv.getBoundingClientRect();
  const mmBW = (mmR.width - mmDiv.clientWidth) * 0.5;
  const mmX = (mmR.left + mmBW) | 0;
  const mmY = (H - mmR.bottom + mmBW) | 0;
  const mmSW = mmDiv.clientWidth;
  const mmSH = mmDiv.clientHeight;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(mmX, mmY, mmSW, mmSH);
  gl.viewport(mmX, mmY, mmSW, mmSH);

  gl.useProgram(mmP);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.bindBuffer(gl.ARRAY_BUFFER, mmB);
  gl.bufferData(gl.ARRAY_BUFFER, mmD.subarray(0, mmIc * 9), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(mmVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mmIc);
  gl.bindVertexArray(null);

  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, W, H);
}
