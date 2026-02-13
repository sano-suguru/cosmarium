import type { Asteroid, Base, Beam, GameMode, GameState } from './types.ts';

export let gameState: GameState = 'menu';
export let gameMode: GameMode = 0;
export let winTeam = -1;
export let catalogOpen = false;
export let catSelected = 0;
export let timeScale = 0.55;
export let reinforcementTimer = 0;

export const beams: Beam[] = [];
export const asteroids: Asteroid[] = [];
export const bases: [Base, Base] = [
  { x: -1800, y: 0, hp: 500, maxHp: 500 },
  { x: 1800, y: 0, hp: 500, maxHp: 500 },
];

export function setGameState(v: GameState) {
  gameState = v;
}
export function setGameMode(v: GameMode) {
  gameMode = v;
}
export function setWinTeam(v: number) {
  winTeam = v;
}
export function setCatalogOpen(v: boolean) {
  catalogOpen = v;
}
export function setCatSelected(v: number) {
  catSelected = v;
}
export function setTimeScale(v: number) {
  timeScale = v;
}
export function setReinforcementTimer(v: number) {
  reinforcementTimer = v;
}
