import { describe, expect, it } from 'vitest';
import { getModuleAoe } from './module-effects.ts';
import type { ModuleId } from './types.ts';
import { NO_MODULE } from './types.ts';

describe('getModuleAoe', () => {
  it('NO_MODULE → 0', () => {
    expect(getModuleAoe(NO_MODULE)).toBe(0);
  });

  it('拡散弾頭(id=0) → 40', () => {
    expect(getModuleAoe(0 as ModuleId)).toBe(40);
  });

  it('無効な ID → RangeError (moduleDef 経由)', () => {
    expect(() => getModuleAoe(999 as ModuleId)).toThrow(RangeError);
  });
});
