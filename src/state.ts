import type { GameState } from './types.ts';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type State = {
  gameState: GameState;
  codexOpen: boolean;
  codexSelected: number;
  timeScale: number;
  reinforcementTimer: number;
  rng: () => number;
};

let currentSeed = Date.now();
let currentRng = mulberry32(currentSeed);

/**
 * state.rng() への closure ラッパー。simulation/ が state.ts を直接 import せず
 * 引数注入で受け取れるようにする目的。closure 経由のため seedRng() や
 * テスト時の state.rng 差し替えが自動的に反映される（意図的な設計）。
 */
export function rng(): number {
  return state.rng();
}

export function seedRng(seed: number): void {
  currentSeed = seed;
  currentRng = mulberry32(seed);
  state.rng = currentRng;
}

export function getSeed(): number {
  return currentSeed;
}

export const state: State = {
  gameState: 'menu',
  codexOpen: false,
  codexSelected: 0,
  timeScale: 1,
  reinforcementTimer: 0,
  rng: currentRng,
};
