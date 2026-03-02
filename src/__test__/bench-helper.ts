import { afterEach, vi } from 'vitest';
import { resetPools, resetState } from './pool-helper.ts';

afterEach(() => {
  resetPools();
  resetState();
});

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  initUI: vi.fn(),
  _resetGameControl: vi.fn(),
}));
