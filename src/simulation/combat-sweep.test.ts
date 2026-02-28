import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { decUnits, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { ORPHAN_TETHER_BEAM_MULT } from './combat-beam-defense.ts';
import { buildHash } from './spatial-hash.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { BEAM_DECAY_RATE } from '../constants.ts';
import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { _resetSweepHits, SWEEP_DURATION } from './combat-sweep.ts';

afterEach(() => {
  resetPools();
  resetState();
  _resetSweepHits();
  resetReflected();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('combat — SWEEP BEAM (CD-triggered)', () => {
  it('IDLE: cooldown>0 → スイープ不発、beamOn減衰', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(beams.length).toBe(0);
  });

  it('cooldown満了 → スイープ開始 (sweepPhase>0, beamOn=1)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(unit(cruiser).sweepPhase).toBeGreaterThan(0);
    expect(unit(cruiser).beamOn).toBe(1);
  });

  it('sweepPhase進行: += dt / SWEEP_DURATION', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.2;
    unit(cruiser).sweepBaseAngle = 0;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).sweepPhase).toBeCloseTo(0.2 + dt / SWEEP_DURATION);
  });

  it('スイープ完了 → CDリセット (sweepPhase=0, cooldown=1.5)', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.9;
    unit(cruiser).sweepBaseAngle = 0;
    buildHash();
    // 0.9 + 0.1/SWEEP_DURATION > 1 → 完了
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(unit(cruiser).cooldown).toBeCloseTo(unitType(3).fireRate);
  });

  it('sweep-through命中: arc中心付近の敵にdamage=8', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    const cruiserType = unitType(3);
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBe(hpBefore - cruiserType.damage);
  });

  it('arc外ミス: 全スイープ実行しても遠方の敵は無傷', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    const farEnemy = spawnAt(1, 1, 0, 200); // 90°方向 → arc外
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    unit(cruiser).angle = 0;
    buildHash();
    const hpBefore = unit(farEnemy).hp;
    for (let i = 0; i < 30; i++) {
      combat(unit(cruiser), cruiser, 0.016, 0, rng);
    }
    expect(unit(farEnemy).hp).toBe(hpBefore);
  });

  it('Bastion死亡済み参照: 孤児テザー軽減がビームに適用される', () => {
    const cruiserType = unitType(3);
    const cruiser = spawnAt(0, 3, 0, 0);
    const bastion = spawnAt(1, 15, 0, 200);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(enemy).shieldLingerTimer = 1.0;
    unit(enemy).shieldSourceUnit = bastion;
    // Bastion を死亡状態にする
    unit(bastion).alive = false;
    decUnits();
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - cruiserType.damage * ORPHAN_TETHER_BEAM_MULT);
    expect(unit(enemy).shieldSourceUnit).toBe(NO_UNIT);
  });

  it('孤児テザー（sourceUnit未設定）: 軽減ダメージ適用', () => {
    const cruiserType = unitType(3);
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(enemy).shieldLingerTimer = 1.0;
    buildHash();
    const hpBefore = unit(enemy).hp;
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).hp).toBeCloseTo(hpBefore - cruiserType.damage * ORPHAN_TETHER_BEAM_MULT);
  });

  it('敵kill: hp<=0 → killUnit', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 0, 200, 0); // Drone hp=3
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);
    expect(unit(enemy).alive).toBe(false);
  });

  it('ターゲットロスト → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0.3;
    unit(cruiser).target = NO_UNIT;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(unit(cruiser).sweepPhase).toBe(0);
    expect(beams.length).toBe(0);
  });

  it('ビーム描画: SWEEPING中のみaddBeam', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.5;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBeGreaterThan(0);
  });

  it('IDLE中はビーム描画なし', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 1.0;
    unit(cruiser).beamOn = 0;
    unit(cruiser).sweepPhase = 0;
    buildHash();
    combat(unit(cruiser), cruiser, 0.016, 0, rng);
    expect(beams.length).toBe(0);
  });

  it('DPS検証: 2-5の範囲', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(cruiser).target = enemy;
    unit(cruiser).cooldown = 0;
    unit(cruiser).angle = 0;
    unit(enemy).hp = 9999;
    buildHash();
    const hpBefore = unit(enemy).hp;
    for (let i = 0; i < 300; i++) {
      combat(unit(cruiser), cruiser, 0.033, 0, rng);
    }
    const totalDmg = hpBefore - unit(enemy).hp;
    const dps = totalDmg / (300 * 0.033);
    expect(dps).toBeGreaterThanOrEqual(2);
    expect(dps).toBeLessThanOrEqual(5);
  });

  it('距離>=range → beamOn減衰、sweepPhase=0', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > range=350
    unit(cruiser).target = enemy;
    unit(cruiser).beamOn = 0.5;
    unit(cruiser).sweepPhase = 0.3;
    buildHash();
    const dt = 0.1;
    combat(unit(cruiser), cruiser, dt, 0, rng);
    expect(unit(cruiser).beamOn).toBeCloseTo(0.5 - dt * BEAM_DECAY_RATE);
    expect(unit(cruiser).sweepPhase).toBe(0);
  });
});
