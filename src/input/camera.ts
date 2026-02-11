import { canvas, viewport } from '../renderer/webgl-setup.ts';
import { catalogOpen, gameState } from '../state.ts';
import type { Camera } from '../types.ts';

export const cam: Camera = { x: 0, y: 0, z: 1, tz: 1, tx: 0, ty: 0, shkx: 0, shky: 0, shk: 0 };
let drg = false,
  ds = { x: 0, y: 0 },
  cs = { x: 0, y: 0 };

export function addShake(v: number) {
  cam.shk += v;
  cam.shk = Math.min(cam.shk, 60);
}

export function initCamera() {
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (catalogOpen) return;
      const W = viewport.W,
        H = viewport.H;
      const wx = cam.tx + (e.clientX - W / 2) / cam.tz;
      const wy = cam.ty - (e.clientY - H / 2) / cam.tz;
      let nz = cam.tz * (e.deltaY > 0 ? 0.9 : 1.1);
      nz = Math.max(0.05, Math.min(8, nz));
      cam.tx = wx - (e.clientX - W / 2) / nz;
      cam.ty = wy + (e.clientY - H / 2) / nz;
      cam.tz = nz;
    },
    { passive: false },
  );

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !catalogOpen) {
      drg = true;
      ds = { x: e.clientX, y: e.clientY };
      cs = { x: cam.tx, y: cam.ty };
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (drg) {
      cam.tx = cs.x - (e.clientX - ds.x) / cam.tz;
      cam.ty = cs.y + (e.clientY - ds.y) / cam.tz;
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
      cam.tx = 0;
      cam.ty = 0;
      cam.tz = 1;
      e.preventDefault();
    }
  });
}
