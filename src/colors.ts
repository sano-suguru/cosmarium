import type { Color3, Team } from './types.ts';

const TEAM_BASE: readonly [Color3, Color3] = [
  [0.15, 0.85, 1.0], // Team 0 — cyan
  [1.0, 0.35, 0.2], // Team 1 — vermilion
];

interface UnitColorMod {
  readonly hue: number; // -0.5 .. +0.5  colour lean (HSL turns)
  readonly lum: number; // 0.6 .. 1.4    brightness
  readonly sat: number; // 0.5 .. 1.3    saturation
  readonly effectHue?: number;
  readonly effectSat?: number;
}

// 順序は TYPES (unit-types.ts) と一致
const UNIT_MODS: readonly UnitColorMod[] = [
  // 0  Drone       — 小型攻撃: warm lean, vivid
  { hue: -0.08, lum: 1.08, sat: 1.15, effectHue: -0.15, effectSat: 1.35 },
  // 1  Fighter     — 小型攻撃: warm lean, bright
  { hue: -0.06, lum: 1.12, sat: 1.1, effectHue: -0.13, effectSat: 1.3 },
  // 2  Bomber      — 重火力: strong warm, standard brightness
  { hue: -0.1, lum: 0.95, sat: 1.0, effectHue: -0.19, effectSat: 1.2 },
  // 3  Cruiser     — 重火力: deep warm, desaturated heavy
  { hue: -0.12, lum: 0.88, sat: 0.78, effectHue: -0.22, effectSat: 1.05 },
  // 4  Flagship    — 重火力: deepest warm, desaturated heavy
  { hue: -0.14, lum: 0.85, sat: 0.72, effectHue: -0.24, effectSat: 1.05 },
  // 5  Healer      — 支援: pale, cool green-cyan
  { hue: 0.08, lum: 1.3, sat: 0.55, effectHue: 0.15, effectSat: 1.1 },
  // 6  Reflector   — 支援: pale, cool cyan
  { hue: 0.1, lum: 1.15, sat: 0.6, effectHue: 0.17, effectSat: 1.1 },
  // 7  Carrier     — 母艦: unique deep purple
  { hue: 0.14, lum: 0.88, sat: 0.78, effectHue: 0.23, effectSat: 1.15 },
  // 8  Sniper      — 射撃/特殊: cool lean, sharp
  { hue: 0.03, lum: 1.05, sat: 1.2, effectHue: 0.08, effectSat: 1.35 },
  // 9  Lancer      — 重火力: hot amber, bold
  { hue: -0.11, lum: 0.9, sat: 1.0, effectHue: -0.21, effectSat: 1.2 },
  // 10 Launcher    — 射撃/特殊: cool strong lean
  { hue: 0.12, lum: 1.0, sat: 1.05, effectHue: 0.21, effectSat: 1.25 },
  // 11 Disruptor   — 射撃/特殊: warm magenta lean
  { hue: -0.04, lum: 1.1, sat: 1.15, effectHue: -0.1, effectSat: 1.35 },
  // 12 Scorcher    — 射撃/特殊: cool blue-cyan
  { hue: 0.05, lum: 0.9, sat: 1.0, effectHue: 0.11, effectSat: 1.2 },
  // 13 Teleporter  — 小型攻撃: warm pink lean, bright
  { hue: -0.09, lum: 1.15, sat: 1.2, effectHue: -0.17, effectSat: 1.4 },
  // 14 Arcer       — 射撃/特殊: strong warm gold
  { hue: -0.15, lum: 1.1, sat: 1.1, effectHue: -0.25, effectSat: 1.3 },
  // 15 Bastion     — 支援: cool steel, desaturated
  { hue: 0.06, lum: 1.0, sat: 0.55, effectHue: 0.13, effectSat: 1.05 },
];

interface HslMod {
  readonly hue: number;
  readonly lum: number;
  readonly sat: number;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function wrap01(v: number): number {
  const wrapped = v % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function rgbToHsl(color: Color3): Color3 {
  const [r, g, b] = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }

  h /= 6;
  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): Color3 {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function applyMod(base: Color3, mod: HslMod): Color3 {
  const [h, s, l] = rgbToHsl(base);
  const shiftedHue = wrap01(h + mod.hue);
  const shiftedSat = clamp01(s * mod.sat);
  const shiftedLum = clamp01(l * mod.lum);
  const [r, g, b] = hslToRgb(shiftedHue, shiftedSat, shiftedLum);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

// Pre-compute the full 16×2 lookup tables to maintain the exact same
// runtime API (`color(unitType, team)` / `trailColor(unitType, team)`).
function resolveBodyMod(mod: UnitColorMod): HslMod {
  return { hue: mod.hue, lum: mod.lum, sat: mod.sat };
}

function resolveEffectMod(mod: UnitColorMod): HslMod {
  const hue = mod.effectHue ?? mod.hue;
  const sat = mod.effectSat ?? mod.sat * 1.2;
  return { hue, lum: mod.lum, sat };
}

function dimColor(c: Color3, factor: number): Color3 {
  return [clamp01(c[0] * factor), clamp01(c[1] * factor), clamp01(c[2] * factor)];
}

function buildTable(
  resolveMod: (mod: UnitColorMod) => HslMod,
  trailDimFactor?: number | undefined,
): ReadonlyArray<readonly [Color3, Color3]> {
  const table: Array<readonly [Color3, Color3]> = [];
  for (let i = 0; i < UNIT_MODS.length; i++) {
    const mod = UNIT_MODS[i] as UnitColorMod;
    const resolved = resolveMod(mod);
    const c0 = applyMod(TEAM_BASE[0], resolved);
    const c1 = applyMod(TEAM_BASE[1], resolved);
    if (trailDimFactor !== undefined) {
      table.push([dimColor(c0, trailDimFactor), dimColor(c1, trailDimFactor)]);
    } else {
      table.push([c0, c1]);
    }
  }
  return table;
}

const teamColors = buildTable(resolveBodyMod);
const effectColors = buildTable(resolveEffectMod);
const trailColors = buildTable(resolveEffectMod, 0.65);

export function color(t: number, tm: Team): Color3 {
  const row = teamColors[t];
  if (row === undefined) throw new RangeError(`teamColors[${t}] out of range`);
  return row[tm];
}
export function effectColor(t: number, tm: Team): Color3 {
  const row = effectColors[t];
  if (row === undefined) throw new RangeError(`effectColors[${t}] out of range`);
  return row[tm];
}
export function trailColor(t: number, tm: Team): Color3 {
  const row = trailColors[t];
  if (row === undefined) throw new RangeError(`trailColors[${t}] out of range`);
  return row[tm];
}
