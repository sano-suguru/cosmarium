import { afterEach, vi } from 'vitest';
import { resetPools, resetState } from './pool-helper.ts';

afterEach(() => {
  resetPools();
  resetState();
});

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  initUI: vi.fn(),
  _resetGameControlState: vi.fn(),
}));
