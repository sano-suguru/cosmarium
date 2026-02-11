import type { GameState, GameMode, Beam, Asteroid, Base } from './types.ts';

export var gameState: GameState = 'menu';
export var gameMode: GameMode = 0;
export var winTeam = -1;
export var catalogOpen = false;
export var catSelected = 0;
export var timeScale = 0.55;
export var rT = 0;

export var beams: Beam[] = [];
export var asteroids: Asteroid[] = [];
export var bases: Base[] = [
  { x:-1800, y:0, hp:500, mhp:500 },
  { x:1800, y:0, hp:500, mhp:500 }
];

export function setGameState(v: GameState) { gameState = v; }
export function setGameMode(v: GameMode) { gameMode = v; }
export function setWinTeam(v: number) { winTeam = v; }
export function setCatalogOpen(v: boolean) { catalogOpen = v; }
export function setCatSelected(v: number) { catSelected = v; }
export function setTimeScale(v: number) { timeScale = v; }
export function setRT(v: number) { rT = v; }
