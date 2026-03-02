import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeGameLoopState, resetPools, resetState } from '../__test__/pool-helper.ts';
import { SIM_DT } from '../constants.ts';
import { getUnitHWM, unit } from '../pools.ts';
import { rng, seedRng } from '../state.ts';
import { initUnits } from './init.ts';
import { stepOnce } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

vi.mock('../ui/game-control.ts', () => ({
  setSpd: vi.fn(),
  initUI: vi.fn(),
  _resetGameControl: vi.fn(),
}));

afterEach(() => {
  resetPools();
  resetState();
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
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
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
    stepOnce(SIM_DT, i * SIM_DT, rng, gs);
  }

  return captureSnapshot();
}

describe('determinism', () => {
  it('同一シード → 同一結果（完全一致）', () => {
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

      expect(s2.x).toBe(s1.x);
      expect(s2.y).toBe(s1.y);
      expect(s2.hp).toBe(s1.hp);
      expect(s2.alive).toBe(s1.alive);
      expect(s2.angle).toBe(s1.angle);
      expect(s2.cooldown).toBe(s1.cooldown);
      expect(s2.target).toBe(s1.target);
      expect(s2.team).toBe(s1.team);
      expect(s2.type).toBe(s1.type);
    }
  });

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

      expect(s2.x).toBe(s1.x);
      expect(s2.y).toBe(s1.y);
      expect(s2.hp).toBe(s1.hp);
      expect(s2.alive).toBe(s1.alive);
      expect(s2.angle).toBe(s1.angle);
      expect(s2.cooldown).toBe(s1.cooldown);
      expect(s2.target).toBe(s1.target);
      expect(s2.team).toBe(s1.team);
      expect(s2.type).toBe(s1.type);
    }
  });

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

  it('フレームレート非依存: accumulator パターンで SIM_DT*3 を分割しても直接3回呼びと同一結果', () => {
    // パターンA: stepOnce(SIM_DT) を3回直接呼ぶ
    resetPools();
    resetState();
    seedRng(77777);
    initUnits(rng);
    const gsA = makeGameLoopState();
    for (let i = 0; i < 3; i++) {
      stepOnce(SIM_DT, i * SIM_DT, rng, gsA);
    }
    const snapA = captureSnapshot();

    // パターンB: accumulator = SIM_DT * 3 を SIM_DT 刻みで消費
    resetPools();
    resetState();
    seedRng(77777);
    initUnits(rng);
    const gsB = makeGameLoopState();
    let accumulator = SIM_DT * 3;
    let step = 0;
    while (accumulator >= SIM_DT) {
      stepOnce(SIM_DT, step * SIM_DT, rng, gsB);
      accumulator -= SIM_DT;
      step++;
    }
    const snapB = captureSnapshot();

    expect(snapA.length).toBeGreaterThan(0);
    expect(snapB.length).toBe(snapA.length);
    for (let i = 0; i < snapA.length; i++) {
      const a = snapA[i];
      const b = snapB[i];
      if (a === undefined || b === undefined) {
        throw new Error(`Snapshot undefined at index ${i}`);
      }
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(a.y);
      expect(b.hp).toBe(a.hp);
    }
  });
});
