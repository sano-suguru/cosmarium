import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { MAX_INSTANCES } from '../constants.ts';
import { particle, projectile, setParticleCount, setProjectileCount, unit } from '../pools.ts';

const mockWriteSlots = vi.fn();

vi.mock('./buffers.ts', () => ({
  instanceData: new Float32Array(MAX_INSTANCES * 9),
  writeSlots: (...args: unknown[]) => mockWriteSlots(...args),
}));

vi.mock('../ui/dev-overlay.ts', () => ({
  devWarn: vi.fn(),
}));

import { renderScene } from './render-scene.ts';

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
  mockWriteSlots.mockClear();
  beams.length = 0;
});

function getWriteCalls() {
  return mockWriteSlots.mock.calls.map((args: unknown[]) => ({
    x: args[2] as number,
    y: args[3] as number,
    size: args[4] as number,
    r: args[5] as number,
    g: args[6] as number,
    b: args[7] as number,
    a: args[8] as number,
    angle: args[9] as number,
    shape: args[10] as number,
  }));
}

describe('writeOverlay', () => {
  it('active shield overlay は SH_OCT_SHIELD(22) で now=0 時に angle=0, a=0.5 で描画される', () => {
    const idx = spawnAt(0, 0, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;
    u.angle = 1.5;

    renderScene(0);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === 22);
    expect(shieldCall).toBeDefined();
    expect(shieldCall?.angle).toBe(0);
    expect(shieldCall?.a).toBe(0.5);
  });

  it('passive shield (Reflector class) は a=0.15 で描画される', () => {
    const idx = spawnAt(0, 6, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 0;

    renderScene(0);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === 22);
    expect(shieldCall).toBeDefined();
    expect(shieldCall?.a).toBe(0.15);
  });

  it('active shield は passive shield より優先される (Reflector + shieldLingerTimer > 0)', () => {
    const idx = spawnAt(0, 6, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;

    renderScene(0);

    const calls = getWriteCalls();
    const shieldCalls = calls.filter((c) => c.shape === 22);
    expect(shieldCalls).toHaveLength(1);
    expect(shieldCalls[0]?.a).toBe(0.5);
  });

  it('active shield overlay の angle は now*0.5 で回転する', () => {
    const idx = spawnAt(0, 0, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;

    renderScene(2);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === 22);
    expect(shieldCall).toBeDefined();
    expect(shieldCall?.angle).toBeCloseTo(1, 5);
  });

  it('vet overlay は angle=0 で描画される', () => {
    const idx = spawnAt(0, 0, 100, 100);
    const u = unit(idx);
    u.vet = 1;
    u.kills = 3;
    u.angle = 2.0;

    renderScene(0);

    const calls = getWriteCalls();
    const vetOverlay = calls.find((c) => c.shape === 10 && c.angle === 0);
    expect(vetOverlay).toBeDefined();
  });

  it('swarm overlay は angle=0 で描画される', () => {
    const idx = spawnAt(0, 0, 100, 100);
    const u = unit(idx);
    u.swarmN = 3;
    u.angle = 0.8;

    renderScene(0);

    const calls = getWriteCalls();
    const swarmOverlay = calls.find((c) => c.shape === 10 && c.a > 0.06);
    expect(swarmOverlay).toBeDefined();
    expect(swarmOverlay?.angle).toBe(0);
  });
});

describe('writeParticle', () => {
  it('パーティクル描画は angle=0 で描画される', () => {
    const p = particle(0);
    p.alive = true;
    p.x = 50;
    p.y = 60;
    p.size = 5;
    p.r = 1;
    p.g = 0.5;
    p.b = 0.2;
    p.life = 0.8;
    p.maxLife = 1;
    p.shape = 3;
    setParticleCount(1);

    renderScene(0);

    const calls = getWriteCalls();
    const particleCall = calls.find((c) => c.shape === 3);
    expect(particleCall).toBeDefined();
    expect(particleCall?.angle).toBe(0);
    expect(particleCall?.x).toBe(50);
    expect(particleCall?.y).toBe(60);
  });

  it('shape=10 のパーティクルも angle=0', () => {
    const p = particle(0);
    p.alive = true;
    p.x = 10;
    p.y = 20;
    p.size = 8;
    p.r = 1;
    p.g = 1;
    p.b = 1;
    p.life = 0.5;
    p.maxLife = 1;
    p.shape = 10;
    setParticleCount(1);

    renderScene(0);

    const calls = getWriteCalls();
    const particleCall = calls.find((c) => c.shape === 10);
    expect(particleCall).toBeDefined();
    expect(particleCall?.angle).toBe(0);
  });
});

describe('writeBeamSegment', () => {
  it('ビームセグメントは全て shape=12 で描画される', () => {
    beams.push({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      r: 1,
      g: 0,
      b: 0,
      life: 0.5,
      maxLife: 1,
      width: 3,
    });

    renderScene(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === 12);
    expect(beamCalls.length).toBeGreaterThan(0);
    for (const bc of beamCalls) {
      expect(bc.shape).toBe(12);
    }
  });

  it('水平ビームの angle は 0 になる', () => {
    beams.push({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 2,
    });

    renderScene(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === 12);
    for (const bc of beamCalls) {
      expect(bc.angle).toBeCloseTo(0, 5);
    }
  });

  it('斜めビームの angle が atan2(dy,dx) と一致する', () => {
    beams.push({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 2,
    });

    renderScene(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === 12);
    const expectedAngle = Math.atan2(100, 100);
    for (const bc of beamCalls) {
      expect(bc.angle).toBeCloseTo(expectedAngle, 5);
    }
  });

  it('tapered ビームは先端でサイズが縮小される', () => {
    beams.push({
      x1: 0,
      y1: 0,
      x2: 300,
      y2: 0,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 4,
      tapered: true,
    });

    renderScene(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === 12);
    expect(beamCalls.length).toBeGreaterThanOrEqual(3);
    const lastCall = beamCalls[beamCalls.length - 1];
    const secondLastCall = beamCalls[beamCalls.length - 2];
    expect(lastCall).toBeDefined();
    expect(secondLastCall).toBeDefined();
    if (lastCall && secondLastCall) {
      expect(lastCall.size).toBeLessThan(secondLastCall.size);
    }
  });
});

describe('writeInstance（直接使用）', () => {
  it('ユニット本体はユニット固有の angle/shape で描画される', () => {
    spawnAt(0, 1, 200, 300);
    const u = unit(0);
    u.angle = 1.23;

    renderScene(0);

    const calls = getWriteCalls();
    const unitCall = calls.find((c) => c.shape === 1 && Math.abs(c.angle - 1.23) < 0.01);
    expect(unitCall).toBeDefined();
  });

  it('projectile は速度ベクトルから算出された angle で描画される', () => {
    const pr = projectile(0);
    pr.alive = true;
    pr.x = 50;
    pr.y = 50;
    pr.vx = 1;
    pr.vy = 1;
    pr.size = 3;
    pr.r = 1;
    pr.g = 0;
    pr.b = 0;
    pr.homing = false;
    pr.aoe = 0;
    setProjectileCount(1);

    renderScene(0);

    const calls = getWriteCalls();
    const expectedAngle = Math.atan2(1, 1);
    const prCall = calls.find((c) => c.shape === 4 && Math.abs(c.angle - expectedAngle) < 0.01);
    expect(prCall).toBeDefined();
  });

  it('vet=1 のユニット本体は金色方向にティント適用される', () => {
    // vet=0 の基本色を取得
    spawnAt(0, 0, 100, 100);
    renderScene(0);
    const baseCalls = getWriteCalls();
    const baseCall = baseCalls.find((c) => c.a === 0.9 && c.x === 100 && c.y === 100);
    expect(baseCall).toBeDefined();

    // リセットして vet=1 のユニットを生成
    resetPools();
    mockWriteSlots.mockClear();
    const idx1 = spawnAt(0, 0, 100, 100);
    const u = unit(idx1);
    u.vet = 1;
    u.kills = 3;

    renderScene(0);

    const vetCalls = getWriteCalls();
    const vetCall = vetCalls.find((c) => c.a === 0.9 && c.x === 100 && c.y === 100);
    expect(vetCall).toBeDefined();
    // vet=1 → vetTint=0.15: r は基本色より増加（金色方向へシフト）
    if (baseCall && vetCall) {
      expect(vetCall.r).toBeGreaterThan(baseCall.r);
    }
  });
});

describe('renderScene 描画数', () => {
  it('何もない状態では描画インスタンス数 0', () => {
    const count = renderScene(0);
    expect(count).toBe(0);
  });

  it('ユニット1体で複数インスタンスが生成される', () => {
    spawnAt(0, 3, 100, 100);
    const u = unit(0);
    u.hp = u.maxHp * 0.5;

    const count = renderScene(0);
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
