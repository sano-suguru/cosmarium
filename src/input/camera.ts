import { canvas, viewport } from '../renderer/webgl-setup.ts';
import { state } from '../state.ts';
import type { Camera } from '../types.ts';

export const cam: Camera = { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 };
let dragging = false,
  dragStart = { x: 0, y: 0 },
  cameraStart = { x: 0, y: 0 };

export function addShake(v: number, x: number, y: number) {
  const halfW = viewport.W / (2 * cam.z);
  const halfH = viewport.H / (2 * cam.z);
  const viewRadius = Math.sqrt(halfW * halfW + halfH * halfH);

  const dx = x - cam.x;
  const dy = y - cam.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const fadeEnd = viewRadius * 3;

  let factor: number;
  if (dist <= viewRadius) {
    factor = 1;
  } else if (dist >= fadeEnd) {
    factor = 0;
  } else {
    factor = 1 - (dist - viewRadius) / (fadeEnd - viewRadius);
  }

  cam.shake += v * factor;
  cam.shake = Math.min(cam.shake, 60);
}

export function initCamera() {
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (state.codexOpen) return;
      setAutoFollow(false);
      const dpr = viewport.dpr;
      const W = viewport.W / dpr,
        H = viewport.H / dpr;
      const wx = cam.targetX + ((e.clientX - W / 2) * dpr) / cam.targetZ;
      const wy = cam.targetY - ((e.clientY - H / 2) * dpr) / cam.targetZ;
      let nz = cam.targetZ * (e.deltaY > 0 ? 0.9 : 1.1);
      nz = Math.max(0.05, Math.min(8, nz));
      cam.targetX = wx - ((e.clientX - W / 2) * dpr) / nz;
      cam.targetY = wy + ((e.clientY - H / 2) * dpr) / nz;
      cam.targetZ = nz;
    },
    { passive: false },
  );

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !state.codexOpen) {
      setAutoFollow(false);
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      cameraStart = { x: cam.targetX, y: cam.targetY };
    }
  });
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      const dpr = viewport.dpr;
      cam.targetX = cameraStart.x - ((e.clientX - dragStart.x) * dpr) / cam.targetZ;
      cam.targetY = cameraStart.y + ((e.clientY - dragStart.y) * dpr) / cam.targetZ;
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
      setAutoFollow(false);
      cam.targetX = 0;
      cam.targetY = 0;
      cam.targetZ = 1;
      e.preventDefault();
    }
  });
}

let autoFollow = false;
let _onAutoFollowCb: ((on: boolean) => void) | null = null;

export function onAutoFollowChange(cb: (on: boolean) => void): void {
  _onAutoFollowCb = cb;
}

export function toggleAutoFollow(): boolean {
  autoFollow = !autoFollow;
  _onAutoFollowCb?.(autoFollow);
  return autoFollow;
}

export function setAutoFollow(v: boolean): void {
  if (autoFollow === v) return;
  autoFollow = v;
  _onAutoFollowCb?.(autoFollow);
}

export function updateAutoFollow(hotspot: { x: number; y: number; radius: number } | null): void {
  if (!autoFollow || !hotspot) return;
  cam.targetX = hotspot.x;
  cam.targetY = hotspot.y;
  // viewport.W/H は物理ピクセル。シェーダが uZ/uR (両方物理px) で割るため単位が相殺され正しい
  cam.targetZ = Math.max(0.3, Math.min(3.0, Math.min(viewport.W, viewport.H) / (hotspot.radius * 2.5)));
}

export interface CameraSnapshot {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export function snapshotCamera(): CameraSnapshot {
  return {
    x: cam.x,
    y: cam.y,
    z: cam.z,
    targetX: cam.targetX,
    targetY: cam.targetY,
    targetZ: cam.targetZ,
  };
}

export function restoreCamera(s: CameraSnapshot): void {
  cam.x = s.x;
  cam.y = s.y;
  cam.z = s.z;
  cam.targetX = s.targetX;
  cam.targetY = s.targetY;
  cam.targetZ = s.targetZ;
  cam.shake = 0;
  cam.shakeX = 0;
  cam.shakeY = 0;
}

export function snapCamera(): void {
  cam.x = cam.targetX;
  cam.y = cam.targetY;
  cam.z = cam.targetZ;
}

export function updateDemoCamera(centroid: { cx: number; cy: number; radius: number }): void {
  cam.targetX = centroid.cx;
  cam.targetY = centroid.cy;
  // viewport.W/H は物理px — シェーダの uZ/uR が同単位で相殺されるためCSS変換不要
  cam.targetZ = Math.max(1.0, Math.min(3.5, Math.min(viewport.W, viewport.H) / (centroid.radius * 2.5)));
}
