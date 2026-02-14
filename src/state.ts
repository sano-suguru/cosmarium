import type { Beam, GameState } from './types.ts';

export interface State {
  gameState: GameState;
  codexOpen: boolean;
  codexSelected: number;
  timeScale: number;
  reinforcementTimer: number;
}

export const state: State = {
  gameState: 'menu',
  codexOpen: false,
  codexSelected: 0,
  timeScale: 0.55,
  reinforcementTimer: 0,
};

export const beams: Beam[] = [];

export function getBeam(i: number): Beam {
  const b = beams[i];
  if (b === undefined) throw new RangeError(`Invalid beam index: ${i}`);
  return b;
}
