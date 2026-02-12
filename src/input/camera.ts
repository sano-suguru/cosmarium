import { canvas, viewport } from '../renderer/webgl-setup.ts';
import { catalogOpen, gameState } from '../state.ts';
import type { Camera } from '../types.ts';

export const cam: Camera = { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 };
let drg = false,
  ds = { x: 0, y: 0 },
  cs = { x: 0, y: 0 };

export function addShake(v: number) {
  cam.shake += v;
  cam.shake = Math.min(cam.shake, 60);
}

export function initCamera() {
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (catalogOpen) return;
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
    if (e.button === 0 && !catalogOpen) {
      drg = true;
      ds = { x: e.clientX, y: e.clientY };
      cs = { x: cam.targetX, y: cam.targetY };
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (drg) {
      cam.targetX = cs.x - (e.clientX - ds.x) / cam.targetZ;
      cam.targetY = cs.y + (e.clientY - ds.y) / cam.targetZ;
    }
  });
  canvas.addEventListener('mouseup', () => {
    drg = false;
  });
  canvas.addEventListener('mouseleave', () => {
    drg = false;
  });

  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' && gameState === 'play' && !catalogOpen) {
      cam.targetX = 0;
      cam.targetY = 0;
      cam.targetZ = 1;
      e.preventDefault();
    }
  });
}
