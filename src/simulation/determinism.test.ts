import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGameLoopState, resetPools, resetState } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { getUnit } from '../pools.ts';
import { rng, seedRng } from '../state.ts';
import { initUnits } from './init.ts';
import { buildHash } from './spatial-hash.ts';
import { update } from './update.ts';

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

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

interface UnitSnapshot {
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  angle: number;
  cooldown: number;
  target: number;
  team: number;
  type: number;
}

function captureSnapshot(): UnitSnapshot[] {
  const snapshot: UnitSnapshot[] = [];
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (u.alive) {
      snapshot.push({
        x: u.x,
        y: u.y,
        hp: u.hp,
        alive: u.alive,
        angle: u.angle,
        cooldown: u.cooldown,
        target: u.target,
        team: u.team,
        type: u.type,
      });
    }
  }
  return snapshot;
}

function runSimulation(seed: number, ticks: number): UnitSnapshot[] {
  resetPools();
  resetState();
  seedRng(seed);

  initUnits(rng);

  const gs = makeGameLoopState();

  for (let i = 0; i < ticks; i++) {
    buildHash();
    update(0.033, i * 0.033, rng, gs);
  }

  return captureSnapshot();
}

describe('determinism', () => {
  it('同一シード → 同一結果', () => {
    const snapshot1 = runSimulation(12345, 100);
    const snapshot2 = runSimulation(12345, 100);

    expect(snapshot1.length).toBeGreaterThan(0);
    expect(snapshot2.length).toBe(snapshot1.length);

    for (let i = 0; i < snapshot1.length; i++) {
      const s1 = snapshot1[i];
      const s2 = snapshot2[i];

      if (s1 === undefined || s2 === undefined) {
        throw new Error(`Snapshot undefined at index ${i}`);
      }

      expect(s2.x).toBeCloseTo(s1.x, 10);
      expect(s2.y).toBeCloseTo(s1.y, 10);
      expect(s2.hp).toBeCloseTo(s1.hp, 10);
      expect(s2.alive).toBe(s1.alive);
      expect(s2.angle).toBeCloseTo(s1.angle, 10);
      expect(s2.cooldown).toBeCloseTo(s1.cooldown, 10);
      expect(s2.target).toBe(s1.target);
      expect(s2.team).toBe(s1.team);
      expect(s2.type).toBe(s1.type);
    }
  }, 10_000);

  it('同一シード → 同一結果（300tick — 複数増援サイクル）', () => {
    const snapshot1 = runSimulation(42, 300);
    const snapshot2 = runSimulation(42, 300);

    expect(snapshot1.length).toBeGreaterThan(0);
    expect(snapshot2.length).toBe(snapshot1.length);

    for (let i = 0; i < snapshot1.length; i++) {
      const s1 = snapshot1[i];
      const s2 = snapshot2[i];

      if (s1 === undefined || s2 === undefined) {
        throw new Error(`Snapshot undefined at index ${i}`);
      }

      expect(s2.x).toBeCloseTo(s1.x, 10);
      expect(s2.y).toBeCloseTo(s1.y, 10);
      expect(s2.hp).toBeCloseTo(s1.hp, 10);
      expect(s2.alive).toBe(s1.alive);
      expect(s2.angle).toBeCloseTo(s1.angle, 10);
      expect(s2.cooldown).toBeCloseTo(s1.cooldown, 10);
      expect(s2.target).toBe(s1.target);
      expect(s2.team).toBe(s1.team);
      expect(s2.type).toBe(s1.type);
    }
  }, 10_000);

  it('異なるシード → 異なる結果', () => {
    const snapshot1 = runSimulation(12345, 100);
    const snapshot2 = runSimulation(99999, 100);

    expect(snapshot1.length).toBeGreaterThan(0);
    expect(snapshot2.length).toBeGreaterThan(0);

    // 少なくとも1つのユニットで位置またはHPが異なることを確認
    let foundDifference = false;
    const maxLength = Math.min(snapshot1.length, snapshot2.length);

    for (let i = 0; i < maxLength; i++) {
      const s1 = snapshot1[i];
      const s2 = snapshot2[i];

      if (s1 === undefined || s2 === undefined) continue;

      const xDiff = Math.abs(s2.x - s1.x);
      const yDiff = Math.abs(s2.y - s1.y);
      const hpDiff = Math.abs(s2.hp - s1.hp);

      if (xDiff > 0.001 || yDiff > 0.001 || hpDiff > 0.001) {
        foundDifference = true;
        break;
      }
    }

    expect(foundDifference).toBe(true);
  });
});
