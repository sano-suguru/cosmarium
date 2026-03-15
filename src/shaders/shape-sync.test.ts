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
import { TYPES, UNIT_TYPE_COUNT } from '../unit-types.ts';

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

  test('unit shape IDs are 0 to UNIT_TYPE_COUNT-1 sequential', () => {
    for (let i = 0; i < UNIT_TYPE_COUNT; i++) {
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
    for (let i = 0; i < UNIT_TYPE_COUNT; i++) {
      const t = TYPES[i];
      expect(t).toBeDefined();
      expect(t?.shape).toBeLessThan(EFFECT_SHAPE_BASE);
    }
  });

  test('[SHAPE:] marker count matches unit + effect shapes', () => {
    const markerPattern = /\[SHAPE:\d+\s+\w+\]/g;
    const unitMarkers = unitShapesSrc.match(markerPattern) ?? [];
    const effectMarkers = effectShapesSrc.match(markerPattern) ?? [];
    expect(unitMarkers.length).toBe(UNIT_TYPE_COUNT);
    expect(effectMarkers.length).toBe(EFFECT_SHAPE_IDS.length);
  });

  test('unit-shapes.glsl: if/else if チェーンが連続している（先頭のみ if、残りは else if）', () => {
    // sh== 分岐を抽出（if or else if）
    const branchPattern = /\b(else\s+if|if)\s*\(\s*sh\s*==\s*(\d+)\s*\)/g;
    const branches: { keyword: string; id: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = branchPattern.exec(unitShapesSrc)) !== null) {
      branches.push({ keyword: m[1] as string, id: Number(m[2]) });
    }
    expect(branches.length).toBe(UNIT_TYPE_COUNT);
    // 先頭は if、2番目以降は else if でなければならない
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i] as (typeof branches)[0];
      if (i === 0) {
        expect(b.keyword).toBe('if');
      } else {
        expect(b.keyword).toBe('else if');
      }
    }
  });

  test('effect-shapes.glsl: 全分岐が else if（unit-shapes チェーンに接続）', () => {
    const branchPattern = /\b(else\s+if|if)\s*\(\s*sh\s*==\s*(\d+)\s*\)/g;
    const branches: { keyword: string; id: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = branchPattern.exec(effectShapesSrc)) !== null) {
      branches.push({ keyword: m[1] as string, id: Number(m[2]) });
    }
    expect(branches.length).toBe(EFFECT_SHAPE_IDS.length);
    for (const b of branches) {
      expect(b.keyword).toBe('else if');
    }
  });

  test('[SHAPE:] marker IDs are sequential within unit and effect ranges', () => {
    const markerPattern = /\[SHAPE:(\d+)\s+\w+\]/g;

    const unitIds: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = markerPattern.exec(unitShapesSrc)) !== null) {
      unitIds.push(Number(match[1]));
    }
    expect(unitIds).toEqual(Array.from({ length: UNIT_TYPE_COUNT }, (_, i) => i));

    const effectIds: number[] = [];
    const effectPattern = /\[SHAPE:(\d+)\s+\w+\]/g;
    while ((match = effectPattern.exec(effectShapesSrc)) !== null) {
      effectIds.push(Number(match[1]));
    }
    expect(effectIds).toEqual(Array.from({ length: EFFECT_SHAPE_IDS.length }, (_, i) => EFFECT_SHAPE_BASE + i));
  });
});
