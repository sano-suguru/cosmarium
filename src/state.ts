import type { GameState, TimeScale, UnitTypeIndex } from './types.ts';
import { DEFAULT_UNIT_TYPE } from './unit-type-accessors.ts';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @see ui/signals.ts — accessor property に動的置換される */
type State = {
  gameState: GameState;
  codexOpen: boolean;
  codexSelected: UnitTypeIndex;
  timeScale: TimeScale;
  reinforcementTimer: number;
  /**
   * @internal simulation/ からは直接参照禁止。外部には `rng` closure ラッパーを使う。
   * 変更は必ず `seedRng()` 経由で行うこと。直接代入すると closure との整合が壊れる。
   */
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

export function seed(): number {
  return currentSeed;
}

/** 独立した RNG クロージャを生成する。グローバル state.rng を汚染しない */
export function createRng(s: number): () => number {
  return mulberry32(s);
}

export const state: State = {
  gameState: 'menu',
  codexOpen: false,
  codexSelected: DEFAULT_UNIT_TYPE,
  timeScale: 1,
  reinforcementTimer: 0,
  rng: currentRng,
};
