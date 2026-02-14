/**
 * DEV-only on-screen overlay for warnings and errors.
 * All exports are no-ops when `import.meta.env.DEV` is false,
 * so the entire module tree-shakes away in production builds.
 */

let container: HTMLDivElement | null = null;
const MAX_LINES = 12;
const FADE_MS = 6_000;

function ensureContainer(): HTMLDivElement {
  if (container) return container;
  const el = document.createElement('div');
  el.id = '_devOverlay';
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '52px',
    left: '12px',
    zIndex: '999',
    pointerEvents: 'none',
    fontFamily: '"Courier New", monospace',
    fontSize: '11px',
    lineHeight: '1.5',
    maxWidth: '60vw',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  container = el;
  return el;
}

function addLine(msg: string, color: string) {
  const c = ensureContainer();
  const line = document.createElement('div');
  line.textContent = msg;
  Object.assign(line.style, {
    color,
    textShadow: `0 0 6px ${color}`,
    background: 'rgba(0,0,0,0.7)',
    padding: '2px 6px',
    marginTop: '2px',
    borderLeft: `2px solid ${color}`,
    transition: 'opacity 0.4s',
    opacity: '1',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  } satisfies Partial<CSSStyleDeclaration>);
  c.appendChild(line);

  while (c.children.length > MAX_LINES) {
    const oldest = c.children[0];
    if (oldest) c.removeChild(oldest);
  }

  setTimeout(() => {
    line.style.opacity = '0';
    setTimeout(() => {
      line.remove();
    }, 400);
  }, FADE_MS);
}

/** Show warning on screen (DEV only). Also forwards to console.warn. */
export function devWarn(...args: unknown[]) {
  if (!import.meta.env.DEV) return;
  const msg = args.map(String).join(' ');
  console.warn(...args);
  addLine(`⚠ ${msg}`, '#fc0');
}

/** Show error on screen (DEV only). Also forwards to console.error. */
export function devError(...args: unknown[]) {
  if (!import.meta.env.DEV) return;
  const msg = args.map(String).join(' ');
  console.error(...args);
  addLine(`✖ ${msg}`, '#f44');
}
