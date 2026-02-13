import type { Asteroid, Base, Beam, GameMode, GameState } from './types.ts';

export interface State {
  gameState: GameState;
  gameMode: GameMode;
  winTeam: number;
  catalogOpen: boolean;
  catSelected: number;
  timeScale: number;
  reinforcementTimer: number;
}

export const state: State = {
  gameState: 'menu',
  gameMode: 0,
  winTeam: -1,
  catalogOpen: false,
  catSelected: 0,
  timeScale: 0.55,
  reinforcementTimer: 0,
};

export const beams: Beam[] = [];
export const asteroids: Asteroid[] = [];
export const bases: [Base, Base] = [
  { x: -1800, y: 0, hp: 500, maxHp: 500 },
  { x: 1800, y: 0, hp: 500, maxHp: 500 },
];
