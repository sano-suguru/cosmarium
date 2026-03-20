import { describe, expect, it } from 'vitest';
import {
  ASCENSION_MERGE_THRESHOLD,
  getMothershipDef,
  isMothershipAwakened,
  resolveUnitDmgMul,
  resolveUnitHpMul,
} from './mothership-defs.ts';
import { ASCENSION_TYPE, HIVE_TYPE } from './unit-type-accessors.ts';

describe('resolveUnitHpMul', () => {
  it('Ascension + 覚醒 → ベース × getMothershipDef(ASCENSION_TYPE).awakeningHpMul', () => {
    const def = getMothershipDef(ASCENSION_TYPE);
    const result = resolveUnitHpMul(ASCENSION_TYPE, true);
    expect(result).toBeCloseTo(def.unitHpMul * getMothershipDef(ASCENSION_TYPE).awakeningHpMul);
  });

  it('Ascension + 非覚醒 → ベース倍率のみ', () => {
    const def = getMothershipDef(ASCENSION_TYPE);
    const result = resolveUnitHpMul(ASCENSION_TYPE, false);
    expect(result).toBeCloseTo(def.unitHpMul);
  });

  it('非 Ascension + 覚醒 → ベース倍率のみ', () => {
    const def = getMothershipDef(HIVE_TYPE);
    const result = resolveUnitHpMul(HIVE_TYPE, true);
    expect(result).toBeCloseTo(def.unitHpMul);
  });

  it('非 Ascension + 非覚醒 → ベース倍率のみ', () => {
    const def = getMothershipDef(HIVE_TYPE);
    const result = resolveUnitHpMul(HIVE_TYPE, false);
    expect(result).toBeCloseTo(def.unitHpMul);
  });
});

describe('resolveUnitDmgMul', () => {
  it('Ascension + 覚醒 → ベース × getMothershipDef(ASCENSION_TYPE).awakeningDmgMul', () => {
    const def = getMothershipDef(ASCENSION_TYPE);
    const result = resolveUnitDmgMul(ASCENSION_TYPE, true);
    expect(result).toBeCloseTo(def.unitDmgMul * getMothershipDef(ASCENSION_TYPE).awakeningDmgMul);
  });

  it('Ascension + 非覚醒 → ベース倍率のみ', () => {
    const def = getMothershipDef(ASCENSION_TYPE);
    const result = resolveUnitDmgMul(ASCENSION_TYPE, false);
    expect(result).toBeCloseTo(def.unitDmgMul);
  });

  it('非 Ascension → ベース倍率のみ', () => {
    const def = getMothershipDef(HIVE_TYPE);
    const result = resolveUnitDmgMul(HIVE_TYPE, true);
    expect(result).toBeCloseTo(def.unitDmgMul);
  });
});

describe('isMothershipAwakened', () => {
  it('Ascension + 閾値以上 → true', () => {
    expect(isMothershipAwakened(ASCENSION_TYPE, ASCENSION_MERGE_THRESHOLD)).toBe(true);
    expect(isMothershipAwakened(ASCENSION_TYPE, ASCENSION_MERGE_THRESHOLD + 5)).toBe(true);
  });

  it('Ascension + 閾値未満 → false', () => {
    expect(isMothershipAwakened(ASCENSION_TYPE, ASCENSION_MERGE_THRESHOLD - 1)).toBe(false);
    expect(isMothershipAwakened(ASCENSION_TYPE, 0)).toBe(false);
  });

  it('非 Ascension（覚醒ボーナスなし）→ mergeCount に関わらず false', () => {
    expect(isMothershipAwakened(HIVE_TYPE, ASCENSION_MERGE_THRESHOLD + 100)).toBe(false);
    expect(isMothershipAwakened(HIVE_TYPE, 0)).toBe(false);
  });
});
