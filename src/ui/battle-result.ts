import type { BattleResult } from '../types.ts';
import {
  DOM_ID_RESULT,
  DOM_ID_RESULT_MENU,
  DOM_ID_RESULT_RECOMPOSE,
  DOM_ID_RESULT_REMATCH,
  DOM_ID_RESULT_STATS,
  DOM_ID_RESULT_TITLE,
} from './dom-ids.ts';
import { getElement } from './dom-util.ts';

type ResultCb = () => void;

let onRecompose: ResultCb = () => undefined;
let onRematch: ResultCb = () => undefined;

interface ResultEls {
  readonly result: HTMLElement;
  readonly title: HTMLElement;
  readonly stats: HTMLElement;
}

let _els: ResultEls | undefined;

function els(): ResultEls {
  if (!_els) throw new Error('initResultDOM() has not been called');
  return _els;
}

export function initResultDOM(menuCb: ResultCb, recomposeCb: ResultCb, rematchCb: ResultCb) {
  onRecompose = recomposeCb;
  onRematch = rematchCb;

  _els = {
    result: getElement(DOM_ID_RESULT),
    title: getElement(DOM_ID_RESULT_TITLE),
    stats: getElement(DOM_ID_RESULT_STATS),
  };

  const elMenu = getElement(DOM_ID_RESULT_MENU);
  const elRecompose = getElement(DOM_ID_RESULT_RECOMPOSE);
  const elRematch = getElement(DOM_ID_RESULT_REMATCH);

  elMenu.addEventListener('click', () => {
    menuCb();
  });

  elRecompose.addEventListener('click', () => {
    onRecompose();
  });

  elRematch.addEventListener('click', () => {
    onRematch();
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function showResult(result: BattleResult) {
  const d = els();

  if (result.victory) {
    d.title.textContent = 'VICTORY';
    d.title.className = 'result-title victory';
  } else {
    d.title.textContent = 'DEFEAT';
    d.title.className = 'result-title defeat';
  }

  d.stats.textContent = '';
  const lines: [string, string][] = [
    ['戦闘時間:', formatTime(result.elapsed)],
    ['残存艦艇:', `${result.playerSurvivors} / ${result.initialPlayerUnits}`],
    ['撃破敵艦:', String(result.enemyKills)],
    ['自軍損失:', String(result.playerLosses)],
  ];
  for (const [label, value] of lines) {
    const row = document.createElement('div');
    const span = document.createElement('span');
    span.className = 'label';
    span.textContent = label;
    row.append(span, `  ${value}`);
    d.stats.appendChild(row);
  }

  d.result.classList.add('open');
}

export function hideResult() {
  els().result.classList.remove('open');
}

export function reopenResult() {
  els().result.classList.add('open');
}
