import { canvas, viewport } from '../renderer/webgl-setup.ts';
import { state } from '../state.ts';
import type { Camera } from '../types.ts';

export const cam: Camera = { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 };
let dragging = false,
  dragStart = { x: 0, y: 0 },
  cameraStart = { x: 0, y: 0 };

const activePointers = new Map<number, { x: number; y: number }>();
let pinchStartDist = 0;
let pinchStartZoom = 0;
let pinchStartCenterX = 0;
let pinchStartCenterY = 0;
let pinchStartCamX = 0;
let pinchStartCamY = 0;

/**
 * screen座標の焦点を保ったままズーム変更。wheel / pinch 両方から使用。
 * ピンチ時は baseCamX/Y/fromScreenX/Y にピンチ開始時点の値を渡し、
 * toScreenX/Y に現在の指中心を渡すことで焦点移動にも対応する。
 */
function applyZoom(
  fromScreenX: number,
  fromScreenY: number,
  oldZoom: number,
  newZoom: number,
  baseCamX = cam.targetX,
  baseCamY = cam.targetY,
  toScreenX = fromScreenX,
  toScreenY = fromScreenY,
): void {
  const dpr = viewport.dpr;
  const W = viewport.W / dpr;
  const H = viewport.H / dpr;
  const wx = baseCamX + ((fromScreenX - W / 2) * dpr) / oldZoom;
  const wy = baseCamY - ((fromScreenY - H / 2) * dpr) / oldZoom;
  cam.targetX = wx - ((toScreenX - W / 2) * dpr) / newZoom;
  cam.targetY = wy + ((toScreenY - H / 2) * dpr) / newZoom;
  cam.targetZ = newZoom;
}

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
      const nz = Math.max(0.05, Math.min(8, cam.targetZ * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyZoom(e.clientX, e.clientY, cam.targetZ, nz);
    },
    { passive: false },
  );

  canvas.addEventListener('pointerdown', (e) => {
    if (state.codexOpen) return;
    if (activePointers.size >= 2) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1 && e.button === 0) {
      setAutoFollow(false);
      dragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      cameraStart = { x: cam.targetX, y: cam.targetY };
      canvas.setPointerCapture(e.pointerId);
    } else if (activePointers.size === 2) {
      dragging = false;
      setAutoFollow(false);
      const pts = [...activePointers.values()];
      const p0 = pts[0];
      const p1 = pts[1];
      if (!p0 || !p1) return;
      pinchStartDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      pinchStartZoom = cam.targetZ;
      pinchStartCamX = cam.targetX;
      pinchStartCamY = cam.targetY;
      pinchStartCenterX = (p0.x + p1.x) / 2;
      pinchStartCenterY = (p0.y + p1.y) / 2;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStartDist > 0) {
      const pts = [...activePointers.values()];
      const p0 = pts[0];
      const p1 = pts[1];
      if (!p0 || !p1) return;
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const nz = Math.max(0.05, Math.min(8, pinchStartZoom * (dist / pinchStartDist)));
      applyZoom(
        pinchStartCenterX,
        pinchStartCenterY,
        pinchStartZoom,
        nz,
        pinchStartCamX,
        pinchStartCamY,
        (p0.x + p1.x) / 2,
        (p0.y + p1.y) / 2,
      );
    } else if (dragging) {
      const dpr = viewport.dpr;
      cam.targetX = cameraStart.x - ((e.clientX - dragStart.x) * dpr) / cam.targetZ;
      cam.targetY = cameraStart.y + ((e.clientY - dragStart.y) * dpr) / cam.targetZ;
    }
  });

  function handlePointerEnd(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      pinchStartDist = 0;
    }
    if (activePointers.size === 0) {
      dragging = false;
    } else if (activePointers.size === 1) {
      const remaining = [...activePointers.values()][0];
      if (remaining) {
        dragging = true;
        dragStart = { x: remaining.x, y: remaining.y };
        cameraStart = { x: cam.targetX, y: cam.targetY };
      }
    }
  }

  canvas.addEventListener('pointerup', handlePointerEnd);
  canvas.addEventListener('pointercancel', handlePointerEnd);

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
