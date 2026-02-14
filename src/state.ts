import type { Base, Beam, GameMode, GameState } from './types.ts';

export interface State {
  gameState: GameState;
  gameMode: GameMode;
  winTeam: number;
  codexOpen: boolean;
  codexSelected: number;
  timeScale: number;
  reinforcementTimer: number;
}

export const state: State = {
  gameState: 'menu',
  gameMode: 0,
  winTeam: -1,
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

export const bases: [Base, Base] = [
  { x: -1800, y: 0, hp: 500, maxHp: 500 },
  { x: 1800, y: 0, hp: 500, maxHp: 500 },
];
