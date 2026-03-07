import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  EFFECT_SHAPE_BASE,
  SH_BAR,
  SH_BEAM,
  SH_CIRCLE,
  SH_DIAMOND,
  SH_DIAMOND_RING,
  SH_EXPLOSION_RING,
  SH_HOMING,
  SH_LIGHTNING,
  SH_OCT_SHIELD,
  SH_REFLECT_FIELD,
  SH_TRAIL,
} from '../constants.ts';
import { TYPES } from '../unit-types.ts';

const shadersDir = resolve(import.meta.dirname, '.');

function readGlsl(relativePath: string): string {
  return readFileSync(resolve(shadersDir, relativePath), 'utf-8');
}

const shapeCountSrc = readGlsl('includes/shape-count.glsl');
const unitShapesSrc = readGlsl('includes/shapes/unit-shapes.glsl');
const effectShapesSrc = readGlsl('includes/shapes/effect-shapes.glsl');

const numShapesMatch = shapeCountSrc.match(/#define\s+NUM_SHAPES\s+(\d+)/);
const NUM_SHAPES = numShapesMatch ? Number(numShapesMatch[1]) : -1;

const EFFECT_SHAPE_IDS = [
  SH_CIRCLE,
  SH_DIAMOND,
  SH_HOMING,
  SH_BEAM,
  SH_LIGHTNING,
  SH_EXPLOSION_RING,
  SH_DIAMOND_RING,
  SH_OCT_SHIELD,
  SH_REFLECT_FIELD,
  SH_BAR,
  SH_TRAIL,
] as const;

describe('GLSL ↔ TypeScript shape sync', () => {
  test('NUM_SHAPES = EFFECT_SHAPE_BASE + effect shape count', () => {
    expect(NUM_SHAPES).toBe(EFFECT_SHAPE_BASE + EFFECT_SHAPE_IDS.length);
  });

  test('unit shape IDs are 0 to TYPES.length-1 sequential', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i];
      expect(t).toBeDefined();
      expect(t?.shape).toBe(i);
    }
  });

  test('effect shape IDs are sequential from EFFECT_SHAPE_BASE', () => {
    expect(SH_CIRCLE).toBe(EFFECT_SHAPE_BASE);
    expect(SH_TRAIL).toBe(NUM_SHAPES - 1);
    for (let i = 0; i < EFFECT_SHAPE_IDS.length; i++) {
      expect(EFFECT_SHAPE_IDS[i]).toBe(EFFECT_SHAPE_BASE + i);
    }
  });

  test('EFFECT_SHAPE_BASE > max unit shape ID (no overlap)', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i];
      expect(t).toBeDefined();
      expect(t?.shape).toBeLessThan(EFFECT_SHAPE_BASE);
    }
  });

  test('[SHAPE:] marker count matches unit + effect shapes', () => {
    const markerPattern = /\[SHAPE:\d+\s+\w+\]/g;
    const unitMarkers = unitShapesSrc.match(markerPattern) ?? [];
    const effectMarkers = effectShapesSrc.match(markerPattern) ?? [];
    expect(unitMarkers.length).toBe(TYPES.length);
    expect(effectMarkers.length).toBe(EFFECT_SHAPE_IDS.length);
  });

  test('[SHAPE:] marker IDs are sequential within unit and effect ranges', () => {
    const markerPattern = /\[SHAPE:(\d+)\s+\w+\]/g;

    const unitIds: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = markerPattern.exec(unitShapesSrc)) !== null) {
      unitIds.push(Number(match[1]));
    }
    expect(unitIds).toEqual(Array.from({ length: TYPES.length }, (_, i) => i));

    const effectIds: number[] = [];
    const effectPattern = /\[SHAPE:(\d+)\s+\w+\]/g;
    while ((match = effectPattern.exec(effectShapesSrc)) !== null) {
      effectIds.push(Number(match[1]));
    }
    expect(effectIds).toEqual(Array.from({ length: EFFECT_SHAPE_IDS.length }, (_, i) => EFFECT_SHAPE_BASE + i));
  });
});
