import { describe, expect, it } from 'vitest';
import { invSqrtMass, TYPES, unitType, unitTypeIndex } from './unit-types.ts';

describe('TYPES 配列', () => {
  it('要素数が15', () => {
    expect(TYPES).toHaveLength(15);
  });

  it('全タイプに必須プロパティが存在する', () => {
    const required = [
      'name',
      'size',
      'hp',
      'speed',
      'turnRate',
      'fireRate',
      'range',
      'damage',
      'shape',
      'trailInterval',
      'mass',
      'description',
      'attackDesc',
    ];
    for (const t of TYPES) {
      for (const key of required) {
        expect(t).toHaveProperty(key);
      }
    }
  });

  it('nm が全て一意', () => {
    const names = TYPES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('数値プロパティが妥当な範囲内', () => {
    for (const t of TYPES) {
      expect(t.hp).toBeGreaterThan(0);
      expect(t.speed).toBeGreaterThan(0);
      expect(t.mass).toBeGreaterThan(0);
      expect(t.size).toBeGreaterThan(0);
      expect(t.shape).toBeGreaterThanOrEqual(0);
      expect(t.shape % 1).toBe(0); // 整数
      expect(t.shape).toBeLessThanOrEqual(30);
      expect(t.trailInterval).toBeGreaterThan(0);
      expect(t.fireRate).toBeGreaterThan(0);
    }
  });

  it('特殊フラグ: idx 2 (Bomber) は aoe を持つ', () => {
    expect(unitType(2).aoe).toBe(42);
  });

  it('特殊フラグ: idx 3 (Cruiser) は sweep を持つ', () => {
    expect(unitType(3).sweep).toBe(true);
  });

  it('特殊フラグ: idx 5 (Healer) は heals を持つ', () => {
    expect(unitType(5).heals).toBe(true);
  });

  it('特殊フラグ: idx 6 (Reflector) は reflects を持つ', () => {
    expect(unitType(6).reflects).toBe(true);
  });

  it('特殊フラグ: idx 7 (Carrier) は spawns を持つ', () => {
    expect(unitType(7).spawns).toBe(true);
  });

  it('特殊フラグ: idx 9 (Lancer) は rams を持つ', () => {
    expect(unitType(9).rams).toBe(true);
  });

  it('特殊フラグ: idx 10 (Launcher) は homing を持つ', () => {
    expect(unitType(10).homing).toBe(true);
  });

  it('特殊フラグ: idx 11 (Disruptor) は emp を持つ', () => {
    expect(unitType(11).emp).toBe(true);
  });

  it('特殊フラグ: idx 12 (Beam Frig.) は beam を持つ', () => {
    expect(unitType(12).beam).toBe(true);
  });

  it('特殊フラグ: idx 13 (Teleporter) は teleports を持つ', () => {
    expect(unitType(13).teleports).toBe(true);
  });

  it('特殊フラグ: idx 14 (Arcer) は chain を持つ', () => {
    expect(unitType(14).chain).toBe(true);
  });

  it('フラグを持たないタイプ (Drone, Fighter, Flagship, Sniper) は特殊フラグなし', () => {
    for (const idx of [0, 1, 4, 8]) {
      const t = unitType(idx);
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

describe('getUnitType — エラーパス', () => {
  it('負のインデックスでRangeError', () => {
    expect(() => unitType(-1)).toThrow(RangeError);
  });

  it('TYPES.length以上のインデックスでRangeError', () => {
    expect(() => unitType(TYPES.length)).toThrow(RangeError);
  });
});

describe('invSqrtMass', () => {
  it('全タイプで 1/sqrt(mass) と一致する', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = unitType(i);
      expect(invSqrtMass(i)).toBeCloseTo(1 / Math.sqrt(t.mass), 10);
    }
  });

  it('負のインデックスでRangeError', () => {
    expect(() => invSqrtMass(-1)).toThrow(RangeError);
  });

  it('TYPES.length以上のインデックスでRangeError', () => {
    expect(() => invSqrtMass(TYPES.length)).toThrow(RangeError);
  });
});

describe('unitTypeIndex', () => {
  it('既知の名前でインデックスを返す', () => {
    expect(unitTypeIndex('Drone')).toBe(0);
    expect(unitTypeIndex('Fighter')).toBe(1);
    expect(unitTypeIndex('Arcer')).toBe(14);
  });

  it('存在しない名前でRangeError', () => {
    expect(() => unitTypeIndex('NonExistent')).toThrow(RangeError);
  });

  it('全タイプ名が正引き可能', () => {
    for (let i = 0; i < TYPES.length; i++) {
      const t = unitType(i);
      expect(unitTypeIndex(t.name)).toBe(i);
    }
  });
});
