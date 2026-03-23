import type { UnitTypeIndex } from '../../types.ts';
import {
  ACCELERATOR_TYPE,
  BLOODBORNE_TYPE,
  CARRIER_BAY_TYPE,
  COLOSSUS_TYPE,
  DREADNOUGHT_TYPE,
  HIVE_TYPE,
  REACTOR_TYPE,
  SYNDICATE_TYPE,
} from '../../unit-type-accessors.ts';

export const ACCENT_COLORS = new Map<UnitTypeIndex, string>([
  [HIVE_TYPE, '#0f8'],
  [DREADNOUGHT_TYPE, '#88f'],
  [REACTOR_TYPE, '#f80'],
  [COLOSSUS_TYPE, '#a8f'],
  [CARRIER_BAY_TYPE, '#8cf'],
  [ACCELERATOR_TYPE, '#ff4'],
  [SYNDICATE_TYPE, '#fc4'],
  [BLOODBORNE_TYPE, '#f44'],
]);

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) {
    const r = h.charAt(0);
    const g = h.charAt(1);
    const b = h.charAt(2);
    return [Number.parseInt(r + r, 16), Number.parseInt(g + g, 16), Number.parseInt(b + b, 16)];
  }
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}

const BG_R = 0;
const BG_G = 20;
const BG_B = 40;
const BG_ALPHA = 0.8;
const BG_BLEND = 0.92;
const ACCENT_BLEND = 0.08;

/** accent hex からオパシティ別 CSS 変数を生成 */
export function buildAccentVars(hex: string): Record<string, string> {
  const [r, g, b] = parseHex(hex);
  const mr = Math.round(r * ACCENT_BLEND + BG_R * BG_BLEND);
  const mg = Math.round(g * ACCENT_BLEND + BG_G * BG_BLEND);
  const mb = Math.round(b * ACCENT_BLEND + BG_B * BG_BLEND);
  const ma = ACCENT_BLEND + BG_ALPHA * BG_BLEND;
  return {
    '--accent': hex,
    '--accent-10': `rgba(${r}, ${g}, ${b}, 0.1)`,
    '--accent-15': `rgba(${r}, ${g}, ${b}, 0.15)`,
    '--accent-30': `rgba(${r}, ${g}, ${b}, 0.3)`,
    '--accent-40': `rgba(${r}, ${g}, ${b}, 0.4)`,
    '--accent-50': `rgba(${r}, ${g}, ${b}, 0.5)`,
    '--accent-8-bg': `rgba(${mr}, ${mg}, ${mb}, ${ma})`,
  };
}
