import { effect, signal } from '@preact/signals';
import { state } from '../state.ts';
import type { FleetComposition, GameState, TimeScale, UnitTypeIndex } from '../types.ts';
import type { ResultData } from './battle-result/result-data.ts';

// Signal を単一の真実の源泉にする。
// state.gameState / state.codexOpen / state.codexSelected への代入は自動的に signal を更新する。
export const gameState$ = signal<GameState>(state.gameState);
export const codexOpen$ = signal(state.codexOpen);
export const codexSelected$ = signal<UnitTypeIndex>(state.codexSelected as UnitTypeIndex);

/** resultData$ が non-null のとき結果パネルを表示。null で非表示。 */
export const resultData$ = signal<ResultData | null>(null);

export const composeVisible$ = signal(false);
export const composeEnemyFleet$ = signal<FleetComposition>([]);
export const composeEnemyArchName$ = signal('');

export const playUiVisible$ = signal(false);
export const autoFollowActive$ = signal(false);

/** timeScale$ は state.timeScale の signal ミラー。Object.defineProperty で自動同期。 */
export const timeScale$ = signal<TimeScale>(state.timeScale);

Object.defineProperty(state, 'timeScale', {
  get: () => timeScale$.value,
  set: (v: TimeScale) => {
    timeScale$.value = v;
  },
  enumerable: true,
  configurable: true,
});

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

Object.defineProperty(state, 'codexSelected', {
  get: () => codexSelected$.value,
  set: (v: UnitTypeIndex) => {
    codexSelected$.value = v;
  },
  enumerable: true,
  configurable: true,
});

/** minimap の display を signal に連動させる。initMinimap() 後に1回だけ呼ぶ。 */
export function initMinimapVisibility() {
  const el = document.getElementById('minimap');
  if (!el) {
    return;
  }
  effect(() => {
    el.style.display = playUiVisible$.value && !codexOpen$.value ? 'block' : 'none';
  });
}
