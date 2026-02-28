import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { poolCounts, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { _resetSweepHits } from './combat-sweep.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('combat — RAILGUN', () => {
  it('sniper: Sniper (shape=8) → ヒットスキャン + tracerビーム', () => {
    const sniper = spawnAt(0, 8, 0, 0); // Sniper (shape=8, rng=600)
    const enemy = spawnAt(1, 1, 300, 0);
    unit(sniper).cooldown = 0;
    unit(sniper).target = enemy;
    buildHash();
    combat(unit(sniper), sniper, 0.016, 0, rng);
    // ヒットスキャンなのでプロジェクタイルは生成されない
    expect(poolCounts.projectiles).toBe(0);
    // tracerビームが追加される
    expect(beams.length).toBeGreaterThan(0);
    // マズルフラッシュパーティクル
    expect(poolCounts.particles).toBeGreaterThan(0);
    // 敵にダメージが入る
    expect(unit(enemy).hp).toBeLessThan(unit(enemy).maxHp);
  });
});
