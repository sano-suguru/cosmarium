import { signal } from '@preact/signals';
import { state } from '../state.ts';
import type { GameState } from '../types.ts';

// Signal を単一の真実の源泉にする。
// state.gameState / state.codexOpen への代入は自動的に signal を更新する。
export const gameState$ = signal<GameState>(state.gameState);
export const codexOpen$ = signal(state.codexOpen);

Object.defineProperty(state, 'gameState', {
  get: () => gameState$.value,
  set: (v: GameState) => {
    gameState$.value = v;
  },
  enumerable: true,
  configurable: true,
});

Object.defineProperty(state, 'codexOpen', {
  get: () => codexOpen$.value,
  set: (v: boolean) => {
    codexOpen$.value = v;
  },
  enumerable: true,
  configurable: true,
});
