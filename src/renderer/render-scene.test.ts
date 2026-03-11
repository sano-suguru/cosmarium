import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, reviveParticle, reviveProjectile, spawnAt } from '../__test__/pool-helper.ts';
import { beams, trackingBeams } from '../beams.ts';
import {
  SH_BEAM,
  SH_CIRCLE,
  SH_DIAMOND,
  SH_EXPLOSION_RING,
  SH_OCT_SHIELD,
  SH_REFLECT_FIELD,
  WORLD_SIZE,
} from '../constants.ts';
import { resetInterp, setInterpAlpha } from '../interpolation.ts';
import { particle, projectile, setParticleCount, setProjectileCount, unit } from '../pools.ts';
import { CRUISER_TYPE, DRONE_TYPE, FIGHTER_TYPE, REFLECTOR_TYPE } from '../unit-type-accessors.ts';

const mockWriteSlots = vi.fn();

// vi.mock ホイスティングにより buffers.ts の実値を参照できないためリテラル指定
// ⚠ MAX_INSTANCES は buffers.ts の値と一致させること
vi.mock('./buffers.ts', () => {
  const ab = new ArrayBuffer(100_000 * 9 * 4);
  return {
    MAX_INSTANCES: 100_000,
    instanceData: new Float32Array(ab),
    instanceDataI32: new Int32Array(ab),
    writeSlots: (...args: unknown[]) => mockWriteSlots(...args),
  };
});

vi.mock('../ui/dev-overlay.ts', () => ({
  devWarn: vi.fn(),
}));

import { MAX_INSTANCES } from './buffers.ts';
import { renderScene } from './render-scene.ts';

/** カリング無効（全ワールド可視）で renderScene を呼ぶテストヘルパー */
function renderSceneAll(now: number) {
  return renderScene(now, 0, 0, 1, WORLD_SIZE * 4, WORLD_SIZE * 4);
}

it('mock の MAX_INSTANCES が実値と一致する', () => {
  expect(MAX_INSTANCES).toBe(100_000);
});

beforeEach(() => {
  // テストでは補間を完了状態(alpha=1)に設定し、現在位置をそのまま描画する
  setInterpAlpha(1);
});

afterEach(() => {
  resetPools();
  resetState();
  resetInterp();
  vi.restoreAllMocks();
  mockWriteSlots.mockClear();
  beams.length = 0;
  trackingBeams.length = 0;
});

function getWriteCalls() {
  return mockWriteSlots.mock.calls.map((args: unknown[]) => ({
    x: args[3] as number,
    y: args[4] as number,
    size: args[5] as number,
    r: args[6] as number,
    g: args[7] as number,
    b: args[8] as number,
    a: args[9] as number,
    angle: args[10] as number,
    shape: args[11] as number,
  }));
}

describe('writeOverlay', () => {
  it('active shield overlay は SH_OCT_SHIELD(26) で now=0 時に angle=0, a=0.5 で描画される', () => {
    const idx = spawnAt(0, DRONE_TYPE, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;
    u.angle = 1.5;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === SH_OCT_SHIELD);
    expect(shieldCall).toBeDefined();
    expect(shieldCall?.angle).toBe(0);
    expect(shieldCall?.a).toBe(0.5);
  });

  it('passive shield (Reflector class) は SH_REFLECT_FIELD(27) エネルギー連動alpha で描画される', () => {
    const idx = spawnAt(0, REFLECTOR_TYPE, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 0;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === SH_REFLECT_FIELD);
    expect(shieldCall).toBeDefined();
    // energy満タン: energyRatio(1.0) * 0.2 = 0.2
    expect(shieldCall?.a).toBe(0.2);
  });

  it('Reflector シールドダウン時は赤系の SH_REFLECT_FIELD(27) で描画される', () => {
    const idx = spawnAt(0, REFLECTOR_TYPE, 100, 100);
    const u = unit(idx);
    u.shieldCooldown = 3;
    u.energy = 0;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === SH_REFLECT_FIELD);
    expect(shieldCall).toBeDefined();
    // 赤系: r=1.0, g=0.2, b=0.2
    expect(shieldCall?.r).toBe(1.0);
    expect(shieldCall?.g).toBe(0.2);
    expect(shieldCall?.b).toBe(0.2);
  });

  it('active shield は passive shield より優先される (Reflector + shieldLingerTimer > 0)', () => {
    const idx = spawnAt(0, REFLECTOR_TYPE, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const shieldCalls = calls.filter((c) => c.shape === SH_OCT_SHIELD);
    expect(shieldCalls).toHaveLength(1);
    expect(shieldCalls[0]?.a).toBe(0.5);
  });

  it('active shield overlay の angle は now*0.5 で回転する', () => {
    const idx = spawnAt(0, DRONE_TYPE, 100, 100);
    const u = unit(idx);
    u.shieldLingerTimer = 1.0;

    renderSceneAll(2);

    const calls = getWriteCalls();
    const shieldCall = calls.find((c) => c.shape === SH_OCT_SHIELD);
    expect(shieldCall).toBeDefined();
    expect(shieldCall?.angle).toBeCloseTo(1, 5);
  });

  it('vet overlay は angle=0 で描画される', () => {
    const idx = spawnAt(0, DRONE_TYPE, 100, 100);
    const u = unit(idx);
    u.vet = 1;
    u.kills = 3;
    u.angle = 2.0;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const vetOverlay = calls.find((c) => c.shape === SH_EXPLOSION_RING && c.angle === 0);
    expect(vetOverlay).toBeDefined();
  });

  it('swarm overlay は angle=0 で描画される', () => {
    const idx = spawnAt(0, DRONE_TYPE, 100, 100);
    const u = unit(idx);
    u.swarmN = 3;
    u.angle = 0.8;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const swarmOverlay = calls.find((c) => c.shape === SH_EXPLOSION_RING && c.a > 0.06);
    expect(swarmOverlay).toBeDefined();
    expect(swarmOverlay?.angle).toBe(0);
  });
});

describe('writeParticle', () => {
  it('パーティクル描画は angle=0 で描画される', () => {
    reviveParticle(0);
    const p = particle(0);
    p.x = 50;
    p.y = 60;
    p.size = 5;
    p.r = 1;
    p.g = 0.5;
    p.b = 0.2;
    p.life = 0.8;
    p.maxLife = 1;
    p.shape = SH_CIRCLE;
    setParticleCount(1);

    renderSceneAll(0);

    const calls = getWriteCalls();
    const particleCall = calls.find((c) => c.shape === SH_CIRCLE);
    expect(particleCall).toBeDefined();
    expect(particleCall?.angle).toBe(0);
    expect(particleCall?.x).toBe(50);
    expect(particleCall?.y).toBe(60);
  });

  it('shape=SH_EXPLOSION_RING のパーティクルも angle=0', () => {
    reviveParticle(0);
    const p = particle(0);
    p.x = 10;
    p.y = 20;
    p.size = 8;
    p.r = 1;
    p.g = 1;
    p.b = 1;
    p.life = 0.5;
    p.maxLife = 1;
    p.shape = SH_EXPLOSION_RING;
    setParticleCount(1);

    renderSceneAll(0);

    const calls = getWriteCalls();
    const particleCall = calls.find((c) => c.shape === SH_EXPLOSION_RING);
    expect(particleCall).toBeDefined();
    expect(particleCall?.angle).toBe(0);
  });
});

describe('writeBeamSegment', () => {
  it('ビームセグメントは全て SH_BEAM で描画される', () => {
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
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });

    renderSceneAll(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === SH_BEAM);
    expect(beamCalls.length).toBeGreaterThan(0);
    for (const bc of beamCalls) {
      expect(bc.shape).toBe(SH_BEAM);
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
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });

    renderSceneAll(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === SH_BEAM);
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
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });

    renderSceneAll(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === SH_BEAM);
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
      stepDiv: 1,
      lightning: false,
    });

    renderSceneAll(0);

    const calls = getWriteCalls();
    const beamCalls = calls.filter((c) => c.shape === SH_BEAM);
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
    spawnAt(0, FIGHTER_TYPE, 200, 300);
    const u = unit(0);
    u.angle = 1.23;

    renderSceneAll(0);

    const calls = getWriteCalls();
    const unitCall = calls.find((c) => c.shape === 1 && Math.abs(c.angle - 1.23) < 0.01);
    expect(unitCall).toBeDefined();
  });

  it('projectile は速度ベクトルから算出された angle で描画される', () => {
    reviveProjectile(0);
    const pr = projectile(0);
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

    renderSceneAll(0);

    const calls = getWriteCalls();
    const expectedAngle = Math.atan2(1, 1);
    const prCall = calls.find((c) => c.shape === SH_DIAMOND && Math.abs(c.angle - expectedAngle) < 0.01);
    expect(prCall).toBeDefined();
  });

  it('vet=1 のユニット本体は金色方向にティント適用される', () => {
    // vet=0 の基本色を取得
    spawnAt(0, DRONE_TYPE, 100, 100);
    renderSceneAll(0);
    const baseCalls = getWriteCalls();
    const baseCall = baseCalls.find((c) => c.a === 0.9 && c.x === 100 && c.y === 100);
    expect(baseCall).toBeDefined();

    // リセットして vet=1 のユニットを生成
    resetPools();
    mockWriteSlots.mockClear();
    const idx1 = spawnAt(0, DRONE_TYPE, 100, 100);
    const u = unit(idx1);
    u.vet = 1;
    u.kills = 3;

    renderSceneAll(0);

    const vetCalls = getWriteCalls();
    const vetCall = vetCalls.find((c) => c.a === 0.9 && c.x === 100 && c.y === 100);
    expect(vetCall).toBeDefined();
    // vet=1 → vetTint=0.15: r は基本色より増加（金色方向へシフト）
    if (baseCall && vetCall) {
      expect(vetCall.r).toBeGreaterThan(baseCall.r);
    }
  });
});

describe('Reflector 味方フィールド描画', () => {
  it('味方ユニットに reflectFieldHp > 0 で SH_REFLECT_FIELD が描画される', () => {
    const ally = spawnAt(0, FIGHTER_TYPE, 100, 100); // reflects なし
    const u = unit(ally);
    u.reflectFieldHp = 15;
    renderSceneAll(0);
    const calls = getWriteCalls();
    const fieldCall = calls.find((c) => c.shape === SH_REFLECT_FIELD);
    expect(fieldCall).toBeDefined();
    expect(fieldCall?.r).toBe(0.7);
    expect(fieldCall?.g).toBe(0.5);
    expect(fieldCall?.b).toBe(1.0);
  });

  it('reflectFieldHp = 0 の味方には SH_REFLECT_FIELD が描画されない', () => {
    spawnAt(0, FIGHTER_TYPE, 100, 100);
    renderSceneAll(0);
    const calls = getWriteCalls();
    const fieldCall = calls.find((c) => c.shape === SH_REFLECT_FIELD);
    expect(fieldCall).toBeUndefined();
  });

  it('Reflector 自身は味方フィールド描画ではなく自前描画を使う', () => {
    const idx = spawnAt(0, REFLECTOR_TYPE, 100, 100);
    const u = unit(idx);
    u.reflectFieldHp = 15;
    renderSceneAll(0);
    const calls = getWriteCalls();
    // SH_REFLECT_FIELD は1個のみ（自前描画分）
    const fieldCalls = calls.filter((c) => c.shape === SH_REFLECT_FIELD);
    expect(fieldCalls).toHaveLength(1);
  });
});

describe('renderScene 描画数', () => {
  it('何もない状態では描画インスタンス数 0', () => {
    const count = renderSceneAll(0);
    expect(count).toBe(0);
  });

  it('ユニット1体で複数インスタンスが生成される', () => {
    spawnAt(0, CRUISER_TYPE, 100, 100);
    const u = unit(0);
    u.hp = u.maxHp * 0.5;

    const count = renderSceneAll(0);
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('フラスタムカリング', () => {
  it('画面外ユニットはスキップされる', () => {
    // cx=0, cy=0, cz=1, vW=800, vH=600 → halfW=400, halfH=300
    // Drone(size=4) の unitR = max(30, 4*2.2*2.5) + 10 = 40 → 可視範囲 ±440
    // ユニットを x=5000 に配置 → 画面外
    spawnAt(0, DRONE_TYPE, 5000, 0);
    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面内ユニットは正常に描画される', () => {
    spawnAt(0, DRONE_TYPE, 100, 100);
    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBeGreaterThan(0);
  });

  it('ユニット半径内に画面端がある場合は描画される', () => {
    // cz=1, vW=800 → halfW=400。Drone(size=4) の unitR=40
    // x=410 → 410-40=370 < 400 → 可視
    spawnAt(0, DRONE_TYPE, 410, 0);
    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBeGreaterThan(0);
  });

  it('爆発リングパーティクルは視覚サイズで正しくカリングされる', () => {
    // size=75, SH_EXPLOSION_RING, life≈0 → 視覚サイズ = 75 * (2.2 - 0*1.7) = 165
    // halfW=400 → x=550 なら 550-165=385 < 400 → 可視
    reviveParticle(0);
    const p = particle(0);
    p.x = 550;
    p.y = 0;
    p.size = 75;
    p.r = 1;
    p.g = 0.5;
    p.b = 0.2;
    p.life = 0.001;
    p.maxLife = 1;
    p.shape = SH_EXPLOSION_RING;
    setParticleCount(1);

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBeGreaterThan(0);
  });

  it('爆発リングでも完全に画面外なら描画されない', () => {
    // size=75, SH_EXPLOSION_RING, life≈0 → 視覚サイズ = 165
    // halfW=400 → x=600 なら 600-165=435 > 400 → 不可視
    reviveParticle(0);
    const p = particle(0);
    p.x = 600;
    p.y = 0;
    p.size = 75;
    p.r = 1;
    p.g = 0.5;
    p.b = 0.2;
    p.life = 0.001;
    p.maxLife = 1;
    p.shape = SH_EXPLOSION_RING;
    setParticleCount(1);

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面外パーティクルはスキップされる', () => {
    reviveParticle(0);
    const p = particle(0);
    p.x = 5000;
    p.y = 5000;
    p.size = 5;
    p.r = 1;
    p.g = 1;
    p.b = 1;
    p.life = 1;
    p.maxLife = 1;
    p.shape = SH_CIRCLE;
    setParticleCount(1);

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面外プロジェクタイルはスキップされる', () => {
    reviveProjectile(0);
    const pr = projectile(0);
    pr.x = 5000;
    pr.y = 5000;
    pr.vx = 1;
    pr.vy = 0;
    pr.size = 3;
    pr.r = 1;
    pr.g = 0;
    pr.b = 0;
    pr.homing = false;
    pr.aoe = 0;
    setProjectileCount(1);

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面外ビーム（両端とも画面外）はスキップされる', () => {
    beams.push({
      x1: 5000,
      y1: 5000,
      x2: 6000,
      y2: 5000,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 2,
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面を横断するビームは描画される', () => {
    // ビームの片端が画面内、もう片端が画面外 → AABB交差で描画
    beams.push({
      x1: -100,
      y1: 0,
      x2: 100,
      y2: 0,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 2,
      tapered: false,
      stepDiv: 1,
      lightning: false,
    });

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBeGreaterThan(0);
  });

  it('画面外トラッキングビームはスキップされる', () => {
    const src = spawnAt(0, DRONE_TYPE, 5000, 5000);
    const tgt = spawnAt(1, DRONE_TYPE, 6000, 5000);
    trackingBeams.push({
      srcUnit: src,
      tgtUnit: tgt,
      x1: 5000,
      y1: 5000,
      x2: 6000,
      y2: 5000,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 2,
    });

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('画面外ライトニングビームはスキップされる（幅が LIGHTNING_DEVIATION_FACTOR 倍で判定）', () => {
    // lightning=true → beamHW = width * LIGHTNING_DEVIATION_FACTOR(4)
    // width=10 → beamHW=40。x=5000 なので十分画面外
    beams.push({
      x1: 5000,
      y1: 5000,
      x2: 6000,
      y2: 5000,
      r: 1,
      g: 1,
      b: 1,
      life: 1,
      maxLife: 1,
      width: 10,
      tapered: false,
      stepDiv: 1,
      lightning: true,
    });

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });

  it('ユニット本体がカリングされても Catalyst ゴーストは個別に描画される', () => {
    // Drone(size=4): rs=2.5, unitR = max(30, 4*2.2*2.5)+10 = 40
    // x=450 → 450-40=410 > 400(halfW) → ユニット本体はカリング
    // vx=500(右向き) → ゴーストは左に伸びる: gx = 450 - dist
    // trailLen = max(4*2.0, 500*0.12) = 60, GHOST_COUNT=5
    // i=5: gx=450-60=390, ghostSize=4*(1-5*0.08)*2.5=6.0 → 390+6=396<400, 390-6=384<400 → 可視
    const idx = spawnAt(0, DRONE_TYPE, 450, 0);
    const u = unit(idx);
    u.catalystTimer = 1.0;
    u.vx = 500;
    u.vy = 0;

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBeGreaterThan(0);
  });

  it('ユニットもゴーストも完全に画面外なら描画されない', () => {
    const idx = spawnAt(0, DRONE_TYPE, 600, 0);
    const u = unit(idx);
    u.catalystTimer = 1.0;
    u.vx = 500;
    u.vy = 0;
    // gx = 600 - dist → 最遠ゴースト(i=5): 600-60=540, ghostSize=6 → 540-6=534 > 400 → 不可視

    const count = renderScene(0, 0, 0, 1, 800, 600);
    expect(count).toBe(0);
  });
});
