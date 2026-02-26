import { color } from '../colors.ts';
import type { Team } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { DOM_ID_KILL_FEED } from './dom-ids.ts';

const MAX_ENTRIES = 6;
const FADE_DELAY_MS = 3_000;
const FADE_DURATION_MS = 400;
const INTERVAL_MS = 100;
const QUEUE_MAX = MAX_ENTRIES * 2;

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"';

// Lucide Crosshair
const CROSSHAIR_SVG = `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`;

// Lucide Skull
const SKULL_SVG = `<svg ${SVG_ATTRS}><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>`;

interface KillerInfo {
  team: Team;
  type: number;
}

interface QueuedEntry {
  victimTeam: Team;
  victimType: number;
  killer: KillerInfo | null;
}
let container: HTMLDivElement | null = null;
const queue: QueuedEntry[] = [];
let drainTimer = 0;
let lastShowTime = 0;

export function initKillFeed() {
  const el = document.createElement('div');
  el.id = DOM_ID_KILL_FEED;
  Object.assign(el.style, {
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  container = el;
}

function createNameSpan(color: string, name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.color = color;
  span.textContent = name;
  return span;
}

function createIconSpan(svgHtml: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.color = '#555';
  span.innerHTML = svgHtml;
  return span;
}

function showEntry(victimTeam: Team, victimType: number, killer: KillerInfo | null) {
  if (!container) return;
  const entry = document.createElement('div');
  Object.assign(entry.style, {
    background: 'rgba(0, 5, 15, 0.7)',
    padding: '2px 8px',
    borderRadius: '2px',
    transition: `opacity ${FADE_DURATION_MS}ms`,
    opacity: '1',
    whiteSpace: 'nowrap',
  } satisfies Partial<CSSStyleDeclaration>);
  const victimName = unitType(victimType).name;
  const vc = color(victimType, victimTeam);
  const victimColor = `rgb(${(vc[0] * 255) | 0},${(vc[1] * 255) | 0},${(vc[2] * 255) | 0})`;
  if (killer) {
    const killerName = unitType(killer.type).name;
    const kc = color(killer.type, killer.team);
    const killerColor = `rgb(${(kc[0] * 255) | 0},${(kc[1] * 255) | 0},${(kc[2] * 255) | 0})`;
    entry.append(
      createNameSpan(killerColor, killerName),
      ' ',
      createIconSpan(CROSSHAIR_SVG),
      ' ',
      createNameSpan(victimColor, victimName),
    );
  } else {
    entry.append(createIconSpan(SKULL_SVG), ' ', createNameSpan(victimColor, victimName));
  }

  container.appendChild(entry);
  while (container.children.length > MAX_ENTRIES) {
    const oldest = container.children[0];
    if (oldest) container.removeChild(oldest);
  }

  setTimeout(() => {
    if (!entry.isConnected) return;
    entry.style.opacity = '0';
    setTimeout(() => {
      entry.remove();
    }, FADE_DURATION_MS);
  }, FADE_DELAY_MS);
}

function drainQueue() {
  if (queue.length === 0) {
    drainTimer = 0;
    return;
  }
  const item = queue.shift();
  if (item) {
    showEntry(item.victimTeam, item.victimType, item.killer);
    lastShowTime = performance.now();
  }
  if (queue.length > 0) {
    drainTimer = window.setTimeout(drainQueue, INTERVAL_MS);
  } else {
    drainTimer = 0;
  }
}

export function clearKillFeed() {
  if (drainTimer !== 0) {
    clearTimeout(drainTimer);
    drainTimer = 0;
  }
  queue.length = 0;
  lastShowTime = 0;
  if (container) container.textContent = '';
}
export function addKillFeedEntry(victimTeam: Team, victimType: number, killer: KillerInfo | null) {
  if (!container) return;
  if (drainTimer === 0) {
    const now = performance.now();
    const elapsed = now - lastShowTime;
    if (elapsed >= INTERVAL_MS) {
      showEntry(victimTeam, victimType, killer);
      lastShowTime = now;
      return;
    }
    // Too soon since last show — queue and wait for remaining time
    queue.push({ victimTeam, victimType, killer });
    drainTimer = window.setTimeout(drainQueue, INTERVAL_MS - elapsed);
    return;
  }

  queue.push({ victimTeam, victimType, killer });
  while (queue.length > QUEUE_MAX) {
    queue.shift();
  }
}
