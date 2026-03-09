import { DEFAULT_BUDGET, SORTED_TYPE_INDICES } from '../fleet-cost.ts';
import { getRunInfo } from '../run.ts';
import type { FleetComposition, FleetEntry } from '../types.ts';
import { TYPE_INDICES, TYPES } from '../unit-types.ts';
import {
  DOM_ID_COMPOSE,
  DOM_ID_COMPOSE_BACK,
  DOM_ID_COMPOSE_BUDGET,
  DOM_ID_COMPOSE_CODEX_BTN,
  DOM_ID_COMPOSE_ENEMY,
  DOM_ID_COMPOSE_GRID,
  DOM_ID_COMPOSE_LAUNCH,
  DOM_ID_COMPOSE_REMAINING,
  DOM_ID_COMPOSE_RESET,
  DOM_ID_COMPOSE_ROUND_INFO,
  DOM_ID_COMPOSE_TOTAL,
} from './dom-ids.ts';
import { getElement } from './dom-util.ts';
import { updateRunInfoElement } from './run-info.ts';

const counts: number[] = TYPES.map(() => 0);
let enemyFleet: FleetComposition = [];
let enemyArchName = '';

type LaunchCb = (playerFleet: FleetComposition) => void;
type BackCb = () => void;
type CodexToggleCb = () => void;

let onLaunch: LaunchCb = () => undefined;
let onBack: BackCb = () => undefined;
let onCodexToggle: CodexToggleCb = () => undefined;

interface ComposeEls {
  readonly compose: HTMLElement;
  readonly grid: HTMLElement;
  readonly budget: HTMLElement;
  readonly total: HTMLElement;
  readonly remaining: HTMLElement;
  readonly launch: HTMLButtonElement;
  readonly enemy: HTMLElement;
  readonly codexBtn: HTMLElement;
  readonly roundInfo: HTMLElement;
}

let _els: ComposeEls | undefined;

function els(): ComposeEls {
  if (!_els) {
    throw new Error('initComposeDOM() has not been called');
  }
  return _els;
}

const REPEAT_DELAY = 200;
const REPEAT_INTERVAL = 40;

let repeatTimer = 0;
let repeatInterval = 0;

function stopRepeat() {
  clearTimeout(repeatTimer);
  clearInterval(repeatInterval);
  repeatTimer = 0;
  repeatInterval = 0;
}

function handleGridPointerDown(typeIdx: number, action: 'plus' | 'minus') {
  const exec = () => {
    const c = counts[typeIdx] ?? 0;
    if (action === 'minus') {
      if (c > 0) {
        counts[typeIdx] = c - 1;
        refreshUI();
      }
    } else {
      const cost = TYPES[typeIdx]?.cost ?? 0;
      if (cost <= DEFAULT_BUDGET - usedBudget()) {
        counts[typeIdx] = c + 1;
        refreshUI();
      }
    }
  };
  exec();
  repeatTimer = window.setTimeout(() => {
    repeatInterval = window.setInterval(exec, REPEAT_INTERVAL);
  }, REPEAT_DELAY);
}

function setupGridDelegation(grid: HTMLElement) {
  grid.addEventListener('pointerdown', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) {
      return;
    }
    e.preventDefault();
    const idx = Number(target.dataset.idx);
    const action = target.dataset.action;
    if (Number.isNaN(idx) || (action !== 'plus' && action !== 'minus')) {
      return;
    }
    handleGridPointerDown(idx, action);
  });
  // document レベルで捕捉: グリッド外ドラッグでも確実に停止
  document.addEventListener('pointerup', stopRepeat);
  document.addEventListener('pointercancel', stopRepeat);
}

interface CardRefs {
  readonly plus: HTMLButtonElement;
  readonly minus: HTMLButtonElement;
  readonly count: HTMLElement;
}

const cardRefMap = new Map<number, CardRefs>();

function usedBudget(): number {
  let sum = 0;
  for (const idx of TYPE_INDICES) {
    sum += (counts[idx] ?? 0) * (TYPES[idx]?.cost ?? 0);
  }
  return sum;
}

function totalUnits(): number {
  let sum = 0;
  for (const c of counts) {
    sum += c;
  }
  return sum;
}

function refreshCardStates(remaining: number) {
  for (const [idx, refs] of cardRefMap) {
    const cost = TYPES[idx]?.cost ?? 0;
    const cnt = counts[idx] ?? 0;
    refs.plus.disabled = cost > remaining;
    refs.minus.disabled = cnt <= 0;
    refs.count.textContent = String(cnt);
  }
}

function refreshUI() {
  const d = els();
  const used = usedBudget();
  const remaining = DEFAULT_BUDGET - used;
  const total = totalUnits();

  d.budget.textContent = `${used} / ${DEFAULT_BUDGET}`;
  d.total.textContent = `合計: ${total}隻`;
  d.remaining.textContent = `残り: ${remaining}pt`;
  d.launch.disabled = total === 0;

  refreshCardStates(remaining);
}

function buildGrid() {
  const d = els();
  d.grid.textContent = '';
  cardRefMap.clear();

  for (const typeIdx of SORTED_TYPE_INDICES) {
    const t = TYPES[typeIdx];
    if (!t) {
      continue;
    }
    const cost = t.cost;

    const card = document.createElement('div');
    card.className = 'cc-card';
    card.dataset.idx = String(typeIdx);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'cc-name';
    const dot = document.createElement('span');
    dot.className = 'cc-dot team0';
    nameDiv.append(dot, t.name);

    const costDiv = document.createElement('div');
    costDiv.className = 'cc-cost';
    costDiv.textContent = `${cost}pt`;

    const controls = document.createElement('div');
    controls.className = 'cc-controls';

    const minus = document.createElement('button');
    minus.className = 'cc-minus';
    minus.setAttribute('aria-label', 'decrease');
    minus.textContent = '-';
    minus.dataset.action = 'minus';
    minus.dataset.idx = String(typeIdx);

    const countEl = document.createElement('span');
    countEl.className = 'cc-count';
    countEl.textContent = '0';

    const plus = document.createElement('button');
    plus.className = 'cc-plus';
    plus.setAttribute('aria-label', 'increase');
    plus.textContent = '+';
    plus.dataset.action = 'plus';
    plus.dataset.idx = String(typeIdx);

    controls.append(minus, countEl, plus);
    card.append(nameDiv, costDiv, controls);

    cardRefMap.set(typeIdx, { plus, minus, count: countEl });

    d.grid.appendChild(card);
  }
}

function renderEnemyFleet() {
  const d = els();
  d.enemy.textContent = '';

  const archDiv = document.createElement('div');
  archDiv.className = 'compose-enemy-arch';
  archDiv.textContent = enemyArchName;

  const unitsDiv = document.createElement('div');
  unitsDiv.className = 'compose-enemy-units';
  for (const entry of enemyFleet) {
    const t = TYPES[entry.type];
    if (!t) {
      continue;
    }
    const span = document.createElement('span');
    span.className = 'compose-enemy-unit';
    const dot = document.createElement('span');
    dot.className = 'cc-dot team1';
    span.append(dot, `${t.name} x${entry.count}`);
    unitsDiv.appendChild(span);
  }

  d.enemy.append(archDiv, unitsDiv);
}

export function initComposeDOM(launchCb: LaunchCb, backCb: BackCb, codexToggleCb: CodexToggleCb) {
  onLaunch = launchCb;
  onBack = backCb;
  onCodexToggle = codexToggleCb;

  _els = {
    compose: getElement(DOM_ID_COMPOSE),
    grid: getElement(DOM_ID_COMPOSE_GRID),
    budget: getElement(DOM_ID_COMPOSE_BUDGET),
    total: getElement(DOM_ID_COMPOSE_TOTAL),
    remaining: getElement(DOM_ID_COMPOSE_REMAINING),
    launch: getElement(DOM_ID_COMPOSE_LAUNCH, HTMLButtonElement),
    enemy: getElement(DOM_ID_COMPOSE_ENEMY),
    codexBtn: getElement(DOM_ID_COMPOSE_CODEX_BTN),
    roundInfo: getElement(DOM_ID_COMPOSE_ROUND_INFO),
  };

  const elBack = getElement(DOM_ID_COMPOSE_BACK);

  _els.launch.addEventListener('click', () => {
    const fleet = buildPlayerFleet();
    if (fleet.length > 0) {
      onLaunch(fleet);
    }
  });

  elBack.addEventListener('click', () => {
    onBack();
  });

  const elReset = getElement(DOM_ID_COMPOSE_RESET);
  elReset.addEventListener('click', () => {
    resetCounts();
    refreshUI();
  });

  _els.codexBtn.addEventListener('click', () => {
    onCodexToggle();
  });

  buildGrid();
  setupGridDelegation(_els.grid);
}

function buildPlayerFleet(): FleetComposition {
  const fleet: FleetEntry[] = [];
  for (const idx of TYPE_INDICES) {
    const c = counts[idx] ?? 0;
    if (c > 0) {
      fleet.push({ type: idx, count: c });
    }
  }
  return fleet;
}

export function showCompose(enemy: FleetComposition, archName: string) {
  enemyFleet = enemy;
  enemyArchName = archName;
  renderEnemyFleet();
  refreshUI();
  updateComposeRoundInfo();
  const d = els();
  d.compose.classList.add('open');
  d.codexBtn.classList.add('open');
}

function updateComposeRoundInfo() {
  updateRunInfoElement(els().roundInfo, getRunInfo());
}

export function hideCompose() {
  const d = els();
  d.compose.classList.remove('open');
  d.codexBtn.classList.remove('open');
}

export function getPlayerFleet(): FleetComposition {
  return buildPlayerFleet();
}

export function resetCounts() {
  counts.fill(0);
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetCounts();
  enemyFleet = [];
  enemyArchName = '';
  onLaunch = () => undefined;
  onBack = () => undefined;
  onCodexToggle = () => undefined;
}
