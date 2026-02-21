import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { unit } from '../pools.ts';
import { NO_UNIT } from '../types.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  startGame: vi.fn(),
  initUI: vi.fn(),
}));

import { applyOnKillEffects, KILL_CONTEXT } from './on-kill-effects.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('applyOnKillEffects', () => {
  describe('ProjectileDirect (直撃)', () => {
    it('cooldownResetOnKill 持ちの射撃者 → クールダウンが短縮される', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ProjectileDirect);
      expect(unit(sniper).cooldown).toBeCloseTo(0.8);
    });

    it('cooldownResetOnKill 無しの射撃者 → クールダウン変化なし', () => {
      const fighter = spawnAt(0, 1, 0, 0);
      unit(fighter).cooldown = 2.0;
      applyOnKillEffects(fighter, 0, KILL_CONTEXT.ProjectileDirect);
      expect(unit(fighter).cooldown).toBeCloseTo(2.0);
    });

    it('クールダウンが既に resetOnKill 値以下 → 変化なし', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 0.3;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ProjectileDirect);
      expect(unit(sniper).cooldown).toBeCloseTo(0.3);
    });
  });

  describe('ProjectileAoe (爆風)', () => {
    it('cooldownResetOnKill 持ちでもクールダウン短縮されない', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ProjectileAoe);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });

  describe('Beam', () => {
    it('クールダウン短縮されない', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.Beam);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });

  describe('Ram', () => {
    it('クールダウン短縮されない', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.Ram);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });

  describe('ChainLightning', () => {
    it('クールダウン短縮されない', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ChainLightning);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });

  describe('SweepBeam', () => {
    it('クールダウン短縮されない', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.SweepBeam);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });

  describe('エッジケース', () => {
    it('NO_UNIT → 何もしない（例外なし）', () => {
      expect(() => applyOnKillEffects(NO_UNIT, 0, KILL_CONTEXT.ProjectileDirect)).not.toThrow();
    });

    it('射撃者が死亡済み → クールダウン変化なし', () => {
      const sniper = spawnAt(0, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      unit(sniper).alive = false;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ProjectileDirect);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });

    it('射撃者のチームが sourceTeam と一致しない → クールダウン変化なし', () => {
      const sniper = spawnAt(1, 8, 0, 0);
      unit(sniper).cooldown = 2.5;
      applyOnKillEffects(sniper, 0, KILL_CONTEXT.ProjectileDirect);
      expect(unit(sniper).cooldown).toBeCloseTo(2.5);
    });
  });
});
