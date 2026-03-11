import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { color, color3ToRgb } from '../../colors.ts';
import type { Team } from '../../team.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { unitType } from '../../unit-type-accessors.ts';
import styles from './KillFeed.module.css';

const MAX_ENTRIES = 6;
const INTERVAL_MS = 100;
const QUEUE_MAX = MAX_ENTRIES * 2;

interface KillerTag {
  team: Team;
  type: UnitTypeIndex;
}

interface FeedEntry {
  id: number;
  victimTeam: Team;
  victimType: UnitTypeIndex;
  killer: KillerTag | null;
}

/** Monotonic counter — never reset (ensures unique keys across mount cycles) */
let nextId = 0;
const entries$ = signal<readonly FeedEntry[]>([]);

type QueuedKill = Omit<FeedEntry, 'id'>;
const queue: QueuedKill[] = [];
let drainTimer = 0;
let lastShowTime = 0;

function pushEntry(victimTeam: Team, victimType: UnitTypeIndex, killer: KillerTag | null) {
  const entry: FeedEntry = { id: nextId++, victimTeam, victimType, killer };
  const current = entries$.value;
  entries$.value = current.length >= MAX_ENTRIES ? [...current.slice(1), entry] : [...current, entry];
}

function drainQueue() {
  if (queue.length === 0) {
    drainTimer = 0;
    return;
  }
  const queued = queue.shift();
  if (queued) {
    pushEntry(queued.victimTeam, queued.victimType, queued.killer);
    lastShowTime = performance.now();
  }
  if (queue.length > 0) {
    drainTimer = window.setTimeout(drainQueue, INTERVAL_MS);
  } else {
    drainTimer = 0;
  }
}

export function addKillFeedEntry(victimTeam: Team, victimType: UnitTypeIndex, killer: KillerTag | null) {
  if (drainTimer === 0) {
    const now = performance.now();
    const elapsed = now - lastShowTime;
    if (elapsed >= INTERVAL_MS) {
      pushEntry(victimTeam, victimType, killer);
      lastShowTime = now;
      return;
    }
    queue.push({ victimTeam, victimType, killer });
    drainTimer = window.setTimeout(drainQueue, INTERVAL_MS - elapsed);
    return;
  }

  queue.push({ victimTeam, victimType, killer });
  while (queue.length > QUEUE_MAX) {
    queue.shift();
  }
}

export function clearKillFeed() {
  if (drainTimer !== 0) {
    clearTimeout(drainTimer);
    drainTimer = 0;
  }
  queue.length = 0;
  lastShowTime = 0;
  pendingRemovals.clear();
  entries$.value = [];
}

function toRgb(team: Team, type: UnitTypeIndex): string {
  return color3ToRgb(color(type, team));
}

function SvgIcon({ children }: { children: ComponentChildren }) {
  return (
    <svg
      class={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="vertical-align:middle"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </SvgIcon>
  );
}

function SkullIcon() {
  return (
    <SvgIcon>
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <path d="M8 20v2h8v-2" />
      <path d="m12.5 17-.5-1-.5 1h1z" />
      <path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20" />
    </SvgIcon>
  );
}

const pendingRemovals = new Set<number>();
let rafScheduled = false;

function scheduleRemoval(id: number) {
  pendingRemovals.add(id);
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (pendingRemovals.size > 0) {
        entries$.value = entries$.value.filter((e) => !pendingRemovals.has(e.id));
        pendingRemovals.clear();
      }
    });
  }
}

function KillFeedEntry({ entry }: { entry: FeedEntry }) {
  const remove = () => scheduleRemoval(entry.id);

  const victimName = unitType(entry.victimType).name;
  const victimColor = toRgb(entry.victimTeam, entry.victimType);

  if (entry.killer) {
    const killerName = unitType(entry.killer.type).name;
    const killerColor = toRgb(entry.killer.team, entry.killer.type);
    return (
      <div class={styles.entry} onAnimationEnd={remove}>
        <span style={{ color: killerColor }}>{killerName}</span> <CrosshairIcon />{' '}
        <span style={{ color: victimColor }}>{victimName}</span>
      </div>
    );
  }

  return (
    <div class={styles.entry} onAnimationEnd={remove}>
      <SkullIcon /> <span style={{ color: victimColor }}>{victimName}</span>
    </div>
  );
}

export function KillFeed() {
  useEffect(() => {
    return () => clearKillFeed();
  }, []);

  const list = entries$.value;
  if (list.length === 0) {
    return null;
  }
  return (
    <div class={styles.container}>
      {list.map((e) => (
        <KillFeedEntry key={e.id} entry={e} />
      ))}
    </div>
  );
}
