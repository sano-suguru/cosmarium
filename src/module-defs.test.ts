import { describe, expect, it } from 'vitest';
import { allModuleIds, moduleDef } from './module-defs.ts';
import type { ModuleId } from './types.ts';

describe('moduleDef', () => {
  it('有効な ID で定義を返す', () => {
    const def = moduleDef(0 as ModuleId);
    expect(def.id).toBe(0);
    expect(def.name).toBe('拡散弾頭');
    expect(def.kind).toBe('attack');
    expect(def.aoeRadius).toBe(40);
  });

  it('無効な ID で RangeError', () => {
    expect(() => moduleDef(999 as ModuleId)).toThrow(RangeError);
  });

  it('NO_MODULE(-1) で RangeError', () => {
    expect(() => moduleDef(-1 as ModuleId)).toThrow(RangeError);
  });
});

describe('allModuleIds', () => {
  it('空でないリストを返す', () => {
    const ids = allModuleIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it('各 ID が moduleDef で解決可能', () => {
    for (const id of allModuleIds()) {
      expect(() => moduleDef(id)).not.toThrow();
    }
  });
});
