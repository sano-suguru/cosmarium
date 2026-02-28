import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import { rng } from '../state.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { buildHash } from './spatial-hash.ts';
import { updateSwarmN } from './update.ts';

vi.mock('../input/camera.ts', () => ({
  addShake: vi.fn(),
  cam: { x: 0, y: 0, z: 1, targetZ: 1, targetX: 0, targetY: 0, shakeX: 0, shakeY: 0, shake: 0 },
  initCamera: vi.fn(),
}));

import { combat, demoFlag } from './combat.ts';
import { BURST_INTERVAL } from './combat-fire.ts';
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

describe('combat — NORMAL FIRE', () => {
  it('射程内で cooldown<=0 → プロジェクタイル発射', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    expect(unit(fighter).cooldown).toBeCloseTo(BURST_INTERVAL);
  });

  it('射程外 → プロジェクタイルなし', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 500, 0); // 距離500 > rng
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(0);
  });

  it('vet=1: damage×1.2', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).vet = 1;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    const fighterType = unitType(1);

    expect(projectile(0).damage).toBeCloseTo(fighterType.damage * 1.2);
    expect(projectile(1).damage).toBeCloseTo(fighterType.damage * 1.2);
  });

  it('vet=2: damage×1.4', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(fighter).vet = 2;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    const fighterType = unitType(1);

    expect(projectile(0).damage).toBeCloseTo(fighterType.damage * 1.4);
    expect(projectile(1).damage).toBeCloseTo(fighterType.damage * 1.4);
  });

  it('homing: Launcher → 3発ホーミングミサイル (homing burst)', () => {
    const launcher = spawnAt(0, 10, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(launcher).cooldown = 0;
    unit(launcher).target = enemy;
    buildHash();

    combat(unit(launcher), launcher, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).homing).toBe(true);
    expect(projectile(0).target).toBe(enemy);
    expect(unit(launcher).burstCount).toBe(2);

    unit(launcher).cooldown = 0;
    combat(unit(launcher), launcher, 0.016, 0, rng);
    unit(launcher).cooldown = 0;
    combat(unit(launcher), launcher, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(3);
    expect(unit(launcher).burstCount).toBe(0);
    expect(projectile(1).homing).toBe(true);
    expect(projectile(2).homing).toBe(true);
    expect(unit(launcher).cooldown).toBeCloseTo(unitType(10).fireRate, 1);
  });

  it('aoe: AOEプロジェクタイル生成', () => {
    const bomberType = unitType(2);
    const bomber = spawnAt(0, 2, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(bomberType.aoe);
  });

  it('carpet: Bomber → 4発AOEプロジェクタイル (carpet bomb)', () => {
    const bomberType = unitType(2);
    const bomber = spawnAt(0, 2, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(bomber).cooldown = 0;
    unit(bomber).target = enemy;
    buildHash();

    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    expect(projectile(0).aoe).toBe(bomberType.aoe);
    expect(unit(bomber).burstCount).toBe(3);

    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    expect(unit(bomber).burstCount).toBe(2);

    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    unit(bomber).cooldown = 0;
    combat(unit(bomber), bomber, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(4);
    expect(unit(bomber).burstCount).toBe(0);
    expect(unit(bomber).cooldown).toBeCloseTo(bomberType.fireRate, 1);
  });

  it('broadside: Flagship → チャージ→メイン3発→側面2発', () => {
    const flagship = spawnAt(0, 4, 0, 0);
    const enemy = spawnAt(1, 1, 200, 0);
    unit(flagship).cooldown = 0;
    unit(flagship).target = enemy;
    buildHash();

    // given: チャージ開始
    combat(unit(flagship), flagship, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(0);
    expect(unit(flagship).beamOn).toBeGreaterThan(0);

    // when: チャージ完了まで進める (chargeTime=0.3s)
    const chargeFrames = Math.ceil(0.3 / 0.016) + 1;
    for (let i = 0; i < chargeFrames; i++) {
      combat(unit(flagship), flagship, 0.016, 0, rng);
    }
    // then: メイン砲3発発射、broadside待ち
    expect(poolCounts.projectiles).toBe(3);
    expect(unit(flagship).broadsidePhase).toBe(-1);

    // when: broadside delay消化
    unit(flagship).cooldown = 0;
    combat(unit(flagship), flagship, 0.016, 0, rng);
    // then: メイン3 + 側面2 = 5発
    expect(poolCounts.projectiles).toBe(5);
    expect(unit(flagship).broadsidePhase).toBe(0);
  });

  it('dead target → tgt=-1 に設定して return', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).target = enemy;
    unit(enemy).alive = false; // 死亡状態
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).target).toBe(NO_UNIT);
    expect(poolCounts.projectiles).toBe(0);
  });
});

describe('combat — DRONE SWARM', () => {
  it('孤立 Drone: ダメージ倍率 ×1.0', () => {
    const drone = spawnAt(0, 0, 0, 0); // Drone (swarm, dmg=1)
    const enemy = spawnAt(1, 1, 50, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(1);
    // dmg = 1 * 1.0 (vd) * 1.0 (no allies) = 1.0
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('味方 Drone 3体: ダメージ倍率 ×1.45', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 味方 Drone を周囲に 3体配置 (80以内)
    spawnAt(0, 0, 20, 0);
    spawnAt(0, 0, -20, 0);
    spawnAt(0, 0, 0, 20);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    // dmg = 1 * 1.0 * (1 + 3*0.15) = 1.45
    expect(projectile(0).damage).toBeCloseTo(1.45);
  });

  it('味方 6+体: 上限 ×1.9', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    for (let i = 0; i < 8; i++) {
      spawnAt(0, 0, 10 + i * 5, 10);
    }
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    // min(8, 6) * 0.15 = 0.9 → dmg = 1 * 1.9
    expect(projectile(0).damage).toBeCloseTo(1.9);
  });

  it('他タイプの味方は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // Fighter (type=1) は同型ではないのでカウントされない
    spawnAt(0, 1, 20, 0);
    spawnAt(0, 1, -20, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('敵チームの同型は除外される', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    // 敵チームの Drone
    spawnAt(1, 0, 20, 0);
    spawnAt(1, 0, -20, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    expect(projectile(0).damage).toBeCloseTo(1.0);
  });

  it('孤立 Drone: プロジェクタイル size/color は変化なし', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    combat(unit(drone), drone, 0.016, 0, rng);
    const p = projectile(0);
    expect(p.size).toBeCloseTo(2.05);
    expect(p.r).toBeCloseTo(0.242, 2);
    expect(p.g).toBeCloseTo(1.0, 2);
    expect(p.b).toBeCloseTo(0.452, 2);
  });

  it('味方 6体: プロジェクタイル size 拡大 + 白寄りの色', () => {
    const drone = spawnAt(0, 0, 0, 0);
    const enemy = spawnAt(1, 1, 50, 0);
    for (let i = 0; i < 6; i++) {
      spawnAt(0, 0, 10 + i * 5, 10);
    }
    unit(drone).cooldown = 0;
    unit(drone).target = enemy;
    buildHash();
    updateSwarmN();
    combat(unit(drone), drone, 0.016, 0, rng);
    const p = projectile(0);
    // dmgMul=1.9, sizeMul=1+(0.9)*0.5=1.45, size=2.05*1.45=2.9725
    expect(p.size).toBeCloseTo(2.9725);
    // wb=(1.9-1)*0.4=0.36
    expect(p.r).toBeCloseTo(0.242 + (1 - 0.242) * 0.36, 2);
    expect(p.g).toBeCloseTo(1.0 + (1 - 1.0) * 0.36, 2);
    expect(p.b).toBeCloseTo(0.452 + (1 - 0.452) * 0.36, 2);
  });
});

describe('combat — FIGHTER BURST', () => {
  it('初発でバーストカウント開始 (burst=2, salvo=2 → burstCount=1 after shot)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    expect(unit(fighter).burstCount).toBe(1);
  });

  it('バースト中間: cooldown = BURST_INTERVAL (0.07)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).cooldown).toBeCloseTo(0.07);
  });

  it('最終弾: cooldown = fireRate (0.9)', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 1; // 残り1発
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    // burstCount=0 → cooldown = fireRate = 0.9
    expect(unit(fighter).burstCount).toBe(0);
    expect(unit(fighter).cooldown).toBeCloseTo(0.9);
  });

  it('ターゲットロスト → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    unit(fighter).burstCount = 1;
    unit(fighter).target = NO_UNIT;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).burstCount).toBe(0);
  });

  it('ターゲット死亡 → burstCount リセット', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 1;
    unit(fighter).target = enemy;
    unit(enemy).alive = false;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(unit(fighter).burstCount).toBe(0);
    expect(unit(fighter).target).toBe(NO_UNIT);
  });

  it('salvo=2: 左右対称のキャノン位置から発射', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 0;
    unit(fighter).angle = 0; // +x方向
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    const p0 = projectile(0);
    const p1 = projectile(1);
    expect(p0.x).toBeCloseTo(p1.x, 1);
    expect(p0.y).toBeCloseTo(-p1.y, 1);
    expect(p0.y).not.toBeCloseTo(0);
  });

  it('salvo=2: 2バースト目は後方キャノンペアから発射', () => {
    const fighter = spawnAt(0, 1, 0, 0);
    const enemy = spawnAt(1, 1, 100, 0);
    unit(fighter).cooldown = 0;
    unit(fighter).burstCount = 1; // 2バースト目（残り1発）
    unit(fighter).angle = 0;
    unit(fighter).target = enemy;
    buildHash();
    combat(unit(fighter), fighter, 0.016, 0, rng);
    expect(poolCounts.projectiles).toBe(2);
    const p0 = projectile(0);
    const p1 = projectile(1);
    const fighterType = unitType(1);
    const rearOffsetX = fighterType.cannonOffsets?.[1]?.[0] ?? 0;
    const expectedX = fighterType.size * rearOffsetX;
    expect(p0.x).toBeCloseTo(expectedX, 1);
    expect(p0.y).toBeCloseTo(-p1.y, 1);
  });
});

describe('getDominantDemoFlag', () => {
  it.each([
    [0, 'swarm'],
    [1, 'burst'],
    [2, 'carpet'],
    [3, 'sweep'],
    [4, 'broadside'],
    [5, 'heals'],
    [6, 'reflects'],
    [7, 'spawns'],
    [8, null], // Sniper: railgun は shape===8 分岐で DemoFlag 対象外
    [9, 'rams'],
    [10, 'homing'],
    [11, 'emp'],
    [12, 'beam'],
    [13, 'teleports'],
    [14, 'chain'],
  ] as const)('TYPES[%i] → %s', (idx, expected) => {
    expect(demoFlag(unitType(idx))).toBe(expected);
  });

  it('Bomber (carpet+aoe): carpet が aoe より優先', () => {
    const t = unitType(2);
    expect(t.carpet).toBe(true);
    expect(t.aoe).toBeGreaterThan(0);
    expect(demoFlag(t)).toBe('carpet');
  });

  it('Launcher (homing+burst): homing が burst より優先', () => {
    const t = unitType(10);
    expect(t.homing).toBeTruthy();
    expect(t.shots).toBeGreaterThan(1);
    expect(demoFlag(t)).toBe('homing');
  });

  it('フラグなしユニット → null', () => {
    expect(demoFlag(unitType(8))).toBeNull();
  });
});
