import { canvas, viewport } from '../renderer/webgl-setup.ts';
import { state } from '../state.ts';
import type { Camera } from '../types.ts';

export const cam: Camera = { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 };
let dragging = false,
  dragStart = { x: 0, y: 0 },
  cameraStart = { x: 0, y: 0 };

export function addShake(v: number) {
  cam.shake += v;
  cam.shake = Math.min(cam.shake, 60);
}

export function initCamera() {
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (state.codexOpen) return;
      const W = viewport.W,
        H = viewport.H;
      const wx = cam.targetX + (e.clientX - W / 2) / cam.targetZ;
      const wy = cam.targetY - (e.clientY - H / 2) / cam.targetZ;
      let nz = cam.targetZ * (e.deltaY > 0 ? 0.9 : 1.1);
      nz = Math.max(0.05, Math.min(8, nz));
      cam.targetX = wx - (e.clientX - W / 2) / nz;
      cam.targetY = wy + (e.clientY - H / 2) / nz;
      cam.targetZ = nz;
    },
    { passive: false },
  );

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !state.codexOpen) {
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      cameraStart = { x: cam.targetX, y: cam.targetY };
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      cam.targetX = cameraStart.x - (e.clientX - dragStart.x) / cam.targetZ;
      cam.targetY = cameraStart.y + (e.clientY - dragStart.y) / cam.targetZ;
    }
  });
  canvas.addEventListener('mouseup', () => {
    dragging = false;
  });
  canvas.addEventListener('mouseleave', () => {
    dragging = false;
  });

  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' && state.gameState === 'play' && !state.codexOpen) {
      cam.targetX = 0;
      cam.targetY = 0;
      cam.targetZ = 1;
      e.preventDefault();
    }
  });
}
