import type { Camera } from '../types.ts';
import { viewport, canvas } from '../renderer/webgl-setup.ts';
import { catalogOpen, gameState } from '../state.ts';

export var cam: Camera = { x: 0, y: 0, z: 1, tz: 1, tx: 0, ty: 0, shkx: 0, shky: 0, shk: 0 };
var drg = false,
  ds = { x: 0, y: 0 },
  cs = { x: 0, y: 0 };

export function addShake(v: number) {
  cam.shk += v;
  cam.shk = Math.min(cam.shk, 60);
}

export function initCamera() {
  canvas.addEventListener(
    'wheel',
    function (e) {
      e.preventDefault();
      if (catalogOpen) return;
      var W = viewport.W,
        H = viewport.H;
      var wx = cam.tx + (e.clientX - W / 2) / cam.tz;
      var wy = cam.ty - (e.clientY - H / 2) / cam.tz;
      var nz = cam.tz * (e.deltaY > 0 ? 0.9 : 1.1);
      nz = Math.max(0.05, Math.min(8, nz));
      cam.tx = wx - (e.clientX - W / 2) / nz;
      cam.ty = wy + (e.clientY - H / 2) / nz;
      cam.tz = nz;
    },
    { passive: false },
  );

  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 0 && !catalogOpen) {
      drg = true;
      ds = { x: e.clientX, y: e.clientY };
      cs = { x: cam.tx, y: cam.ty };
    }
  });
  canvas.addEventListener('mousemove', function (e) {
    if (drg) {
      cam.tx = cs.x - (e.clientX - ds.x) / cam.tz;
      cam.ty = cs.y + (e.clientY - ds.y) / cam.tz;
    }
  });
  canvas.addEventListener('mouseup', function () {
    drg = false;
  });
  canvas.addEventListener('mouseleave', function () {
    drg = false;
  });

  addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.code === 'Space' && gameState === 'play' && !catalogOpen) {
      cam.tx = 0;
      cam.ty = 0;
      cam.tz = 1;
      e.preventDefault();
    }
  });
}
