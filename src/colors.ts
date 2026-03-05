import type { Color3, Team, TeamTuple } from './types.ts';
import { TYPES } from './unit-types.ts';

const CYAN: Color3 = [0.15, 0.85, 1.0];
const VERMILION: Color3 = [1.0, 0.35, 0.2];
const GREEN: Color3 = [0.2, 0.9, 0.3];
const PURPLE: Color3 = [0.7, 0.3, 0.9];
const AMBER: Color3 = [0.95, 0.8, 0.15];
const TEAM_BASE: Readonly<TeamTuple<Color3>> = [CYAN, VERMILION, GREEN, PURPLE, AMBER];

function color3ToHex(c: Color3): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
export const TEAM_HEX_COLORS: Readonly<TeamTuple<string>> = TEAM_BASE.map(color3ToHex) as TeamTuple<string>;

/** UI 用パステルネオンパレット — 明度↑ 彩度↓ で暗背景のグロー向き */
function pastelNeon(c: Color3): string {
  const [h, s, l] = rgbToHsl(c);
  const [r, g, b] = hslToRgb(h, clamp01(s * 0.8), clamp01(l * 0.35 + 0.5));
  return color3ToHex([clamp01(r), clamp01(g), clamp01(b)]);
}
export const TEAM_UI_HEX_COLORS: Readonly<TeamTuple<string>> = TEAM_BASE.map(pastelNeon) as TeamTuple<string>;

interface UnitColorMod {
  readonly hue: number; // -0.5 .. +0.5  colour lean (HSL turns)
  readonly lum: number; // 0.6 .. 1.4    brightness
  readonly sat: number; // 0.5 .. 1.3    saturation
  readonly effectHue: number;
  readonly effectSat: number;
}

const UNIT_MOD_MAP: Readonly<Record<string, UnitColorMod>> = {
  Drone: { hue: -0.08, lum: 1.08, sat: 1.15, effectHue: -0.15, effectSat: 1.35 },
  Fighter: { hue: -0.06, lum: 1.12, sat: 1.1, effectHue: -0.13, effectSat: 1.3 },
  Bomber: { hue: -0.1, lum: 0.95, sat: 1.0, effectHue: -0.19, effectSat: 1.2 },
  Cruiser: { hue: -0.12, lum: 0.88, sat: 0.78, effectHue: -0.22, effectSat: 1.05 },
  Flagship: { hue: -0.14, lum: 0.85, sat: 0.72, effectHue: -0.24, effectSat: 1.05 },
  Healer: { hue: 0.08, lum: 1.3, sat: 0.55, effectHue: 0.15, effectSat: 1.1 },
  Reflector: { hue: 0.1, lum: 1.15, sat: 0.6, effectHue: 0.17, effectSat: 1.1 },
  Carrier: { hue: 0.14, lum: 0.88, sat: 0.78, effectHue: 0.23, effectSat: 1.15 },
  Sniper: { hue: 0.03, lum: 1.05, sat: 1.2, effectHue: 0.08, effectSat: 1.35 },
  Lancer: { hue: -0.11, lum: 0.9, sat: 1.0, effectHue: -0.21, effectSat: 1.2 },
  Launcher: { hue: 0.12, lum: 1.0, sat: 1.05, effectHue: 0.21, effectSat: 1.25 },
  Disruptor: { hue: -0.04, lum: 1.1, sat: 1.15, effectHue: -0.1, effectSat: 1.35 },
  Scorcher: { hue: 0.05, lum: 0.9, sat: 1.0, effectHue: 0.11, effectSat: 1.2 },
  Teleporter: { hue: -0.09, lum: 1.15, sat: 1.2, effectHue: -0.17, effectSat: 1.4 },
  Arcer: { hue: -0.15, lum: 1.1, sat: 1.1, effectHue: -0.25, effectSat: 1.3 },
  Bastion: { hue: 0.06, lum: 1.0, sat: 0.55, effectHue: 0.13, effectSat: 1.05 },
  Amplifier: { hue: -0.1, lum: 1.15, sat: 0.85, effectHue: -0.18, effectSat: 1.25 },
  Scrambler: { hue: -0.18, lum: 1.05, sat: 0.95, effectHue: -0.28, effectSat: 1.3 },
  Catalyst: { hue: 0.18, lum: 1.2, sat: 0.65, effectHue: 0.28, effectSat: 1.2 },
};

const UNIT_MODS: readonly UnitColorMod[] = TYPES.map((t) => {
  const mod = UNIT_MOD_MAP[t.name];
  if (!mod) {
    throw new Error(`Missing color mod: ${t.name}`);
  }
  return mod;
});

interface HslMod {
  readonly hue: number;
  readonly lum: number;
  readonly sat: number;
}

function clamp01(v: number): number {
  if (v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
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
  if (tt < 0) {
    tt += 1;
  }
  if (tt > 1) {
    tt -= 1;
  }
  if (tt < 1 / 6) {
    return p + (q - p) * 6 * tt;
  }
  if (tt < 1 / 2) {
    return q;
  }
  if (tt < 2 / 3) {
    return p + (q - p) * (2 / 3 - tt) * 6;
  }
  return p;
}

function hslToRgb(h: number, s: number, l: number): Color3 {
  if (s === 0) {
    return [l, l, l];
  }
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

function resolveBodyMod(mod: UnitColorMod): HslMod {
  return { hue: mod.hue, lum: mod.lum, sat: mod.sat };
}

function resolveEffectMod(mod: UnitColorMod): HslMod {
  const hue = mod.effectHue;
  const sat = mod.effectSat;
  return { hue, lum: mod.lum, sat };
}

function dimColor(c: Color3, factor: number): Color3 {
  return [clamp01(c[0] * factor), clamp01(c[1] * factor), clamp01(c[2] * factor)];
}

function buildTable(
  resolveMod: (mod: UnitColorMod) => HslMod,
  trailDimFactor?: number | undefined,
): ReadonlyArray<Readonly<TeamTuple<Color3>>> {
  const table: Array<Readonly<TeamTuple<Color3>>> = [];
  for (let i = 0; i < UNIT_MODS.length; i++) {
    const mod = UNIT_MODS[i] as UnitColorMod;
    const resolved = resolveMod(mod);
    const row: Color3[] = [];
    for (const base of TEAM_BASE) {
      const c = applyMod(base, resolved);
      row.push(trailDimFactor !== undefined ? dimColor(c, trailDimFactor) : c);
    }
    table.push(row as TeamTuple<Color3>);
  }
  return table;
}

const teamColors = buildTable(resolveBodyMod);
const effectColors = buildTable(resolveEffectMod);
const trailColors = buildTable(resolveEffectMod, 0.65);

export function color(t: number, tm: Team): Color3 {
  const row = teamColors[t];
  if (row === undefined) {
    throw new RangeError(`teamColors[${t}] out of range`);
  }
  return row[tm];
}
export function effectColor(t: number, tm: Team): Color3 {
  const row = effectColors[t];
  if (row === undefined) {
    throw new RangeError(`effectColors[${t}] out of range`);
  }
  return row[tm];
}
export function trailColor(t: number, tm: Team): Color3 {
  const row = trailColors[t];
  if (row === undefined) {
    throw new RangeError(`trailColors[${t}] out of range`);
  }
  return row[tm];
}
