import { describe, expect, it } from 'vitest';
import { NO_PARTICLE, NO_PROJECTILE, NO_UNIT } from './types.ts';

describe('sentinel values', () => {
  it('NO_UNIT is -1', () => {
    expect(NO_UNIT).toBe(-1);
  });

  it('NO_PARTICLE is -1', () => {
    expect(NO_PARTICLE).toBe(-1);
  });

  it('NO_PROJECTILE is -1', () => {
    expect(NO_PROJECTILE).toBe(-1);
  });
});
