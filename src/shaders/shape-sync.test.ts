import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
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
  test('NUM_SHAPES = TYPES.length + effect shape count', () => {
    expect(NUM_SHAPES).toBe(TYPES.length + EFFECT_SHAPE_IDS.length);
  });

  test('unit shape IDs are 0 to TYPES.length-1 sequential', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i];
      expect(t).toBeDefined();
      expect(t?.shape).toBe(i);
    }
  });

  test('effect shape IDs are sequential from TYPES.length', () => {
    const firstEffectId = TYPES.length;
    expect(SH_CIRCLE).toBe(firstEffectId);
    expect(SH_TRAIL).toBe(NUM_SHAPES - 1);
    for (let i = 0; i < EFFECT_SHAPE_IDS.length; i++) {
      expect(EFFECT_SHAPE_IDS[i]).toBe(firstEffectId + i);
    }
  });

  test('[SHAPE:] marker count matches NUM_SHAPES', () => {
    const markerPattern = /\[SHAPE:\d+\s+\w+\]/g;
    const unitMarkers = unitShapesSrc.match(markerPattern) ?? [];
    const effectMarkers = effectShapesSrc.match(markerPattern) ?? [];
    const totalMarkers = unitMarkers.length + effectMarkers.length;
    expect(totalMarkers).toBe(NUM_SHAPES);
  });

  test('[SHAPE:] marker IDs are 0 to NUM_SHAPES-1 in order', () => {
    const markerPattern = /\[SHAPE:(\d+)\s+\w+\]/g;
    const allSrc = unitShapesSrc + effectShapesSrc;
    const ids: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = markerPattern.exec(allSrc)) !== null) {
      ids.push(Number(match[1]));
    }
    expect(ids).toEqual(Array.from({ length: NUM_SHAPES }, (_, i) => i));
  });
});
