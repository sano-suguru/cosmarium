import { describe, expect, it } from 'vitest';
import { TYPES } from './unit-types.ts';

describe('TYPES 配列', () => {
  it('要素数が15', () => {
    expect(TYPES).toHaveLength(15);
  });

  it('全タイプに必須プロパティが存在する', () => {
    const required = ['nm', 'sz', 'hp', 'spd', 'tr', 'fr', 'rng', 'dmg', 'sh', 'trl', 'mass', 'desc', 'atk'];
    for (const t of TYPES) {
      for (const key of required) {
        expect(t).toHaveProperty(key);
      }
    }
  });

  it('nm が全て一意', () => {
    const names = TYPES.map((t) => t.nm);
    expect(new Set(names).size).toBe(names.length);
  });

  it('数値プロパティが妥当な範囲内', () => {
    for (const t of TYPES) {
      expect(t.hp).toBeGreaterThan(0);
      expect(t.spd).toBeGreaterThan(0);
      expect(t.mass).toBeGreaterThan(0);
      expect(t.sz).toBeGreaterThan(0);
      expect(t.sh).toBeGreaterThanOrEqual(0);
      expect(t.sh % 1).toBe(0); // 整数
      expect(t.sh).toBeLessThanOrEqual(20);
      expect(t.trl).toBeGreaterThan(0);
      expect(t.fr).toBeGreaterThan(0);
    }
  });

  it('特殊フラグ: idx 2 (Bomber) は aoe を持つ', () => {
    expect(TYPES[2]!.aoe).toBe(70);
  });

  it('特殊フラグ: idx 3 (Cruiser) は beam を持つ', () => {
    expect(TYPES[3]!.beam).toBe(true);
  });

  it('特殊フラグ: idx 5 (Healer) は heals を持つ', () => {
    expect(TYPES[5]!.heals).toBe(true);
  });

  it('特殊フラグ: idx 6 (Reflector) は reflects を持つ', () => {
    expect(TYPES[6]!.reflects).toBe(true);
  });

  it('特殊フラグ: idx 7 (Carrier) は spawns を持つ', () => {
    expect(TYPES[7]!.spawns).toBe(true);
  });

  it('特殊フラグ: idx 9 (Ram) は rams を持つ', () => {
    expect(TYPES[9]!.rams).toBe(true);
  });

  it('特殊フラグ: idx 10 (Missile) は homing を持つ', () => {
    expect(TYPES[10]!.homing).toBe(true);
  });

  it('特殊フラグ: idx 11 (EMP) は emp を持つ', () => {
    expect(TYPES[11]!.emp).toBe(true);
  });

  it('特殊フラグ: idx 12 (Beam Frig.) は beam を持つ', () => {
    expect(TYPES[12]!.beam).toBe(true);
  });

  it('特殊フラグ: idx 13 (Teleporter) は teleports を持つ', () => {
    expect(TYPES[13]!.teleports).toBe(true);
  });

  it('特殊フラグ: idx 14 (Chain Bolt) は chain を持つ', () => {
    expect(TYPES[14]!.chain).toBe(true);
  });

  it('フラグを持たないタイプ (Drone, Fighter, Flagship, Sniper) は特殊フラグなし', () => {
    for (const idx of [0, 1, 4, 8]) {
      const t = TYPES[idx]!;
      expect(t.beam).toBeUndefined();
      expect(t.heals).toBeUndefined();
      expect(t.reflects).toBeUndefined();
      expect(t.spawns).toBeUndefined();
      expect(t.homing).toBeUndefined();
      expect(t.rams).toBeUndefined();
      expect(t.emp).toBeUndefined();
      expect(t.teleports).toBeUndefined();
      expect(t.chain).toBeUndefined();
    }
  });
});
