/**
 * DEV-only on-screen overlay for warnings and errors.
 * All exports are no-ops when `import.meta.env.DEV` is false,
 * so the entire module tree-shakes away in production builds.
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import styles from './DevOverlay.module.css';

type DevMessage = {
  readonly id: number;
  readonly text: string;
  readonly color: string;
};

const MAX_LINES = 12;
const FADE_TOTAL_MS = 6_400;

const messages$ = signal<readonly DevMessage[]>([]);
let nextId = 0;

function addLine(msg: string, color: string) {
  const id = nextId++;
  messages$.value = [...messages$.value.slice(-(MAX_LINES - 1)), { id, text: msg, color }];
  setTimeout(() => {
    messages$.value = messages$.value.filter((m) => m.id !== id);
  }, FADE_TOTAL_MS);
}

export function devWarn(...args: unknown[]) {
  if (!import.meta.env.DEV) {
    return;
  }
  const msg = args.map(String).join(' ');
  console.warn(...args);
  addLine(`⚠ ${msg}`, '#fc0');
}

export function devError(...args: unknown[]) {
  if (!import.meta.env.DEV) {
    return;
  }
  const msg = args.map(String).join(' ');
  console.error(...args);
  addLine(`✖ ${msg}`, '#f44');
}

export function DevOverlay() {
  const lines = messages$.value;

  useEffect(() => {
    return () => {
      messages$.value = [];
    };
  }, []);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div class={styles.overlay}>
      {lines.map((m) => (
        <div
          key={m.id}
          class={styles.line}
          style={{ color: m.color, textShadow: `0 0 6px ${m.color}`, borderLeftColor: m.color }}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
