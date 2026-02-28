import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { beams } from '../beams.ts';
import { REFLECT_FIELD_MAX_HP } from '../constants.ts';
import { unit } from '../pools.ts';
import { rng } from '../state.ts';
import { unitType } from '../unit-types.ts';
import { REFLECT_BEAM_DAMAGE_MULT } from './combat-beam-defense.ts';
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

describe('combat — BEAM REFLECT (リトロリフレクション)', () => {
  it('攻撃元に直接ダメージが返る', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const expectedDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0 * REFLECT_BEAM_DAMAGE_MULT;
    expect(unit(scorcher).hp).toBeCloseTo(hpBefore - expectedDmg);
    expect(unit(scorcher).hitFlash).toBe(1);
  });

  it('Reflector の angle に依存せず攻撃元にダメージ', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);
    unit(reflector).angle = -Math.PI / 4; // 斜め向き

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).hp).toBeLessThan(hpBefore);
  });

  it('第三者にはダメージが及ばない', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);
    const bystander = spawnAt(0, 1, 0, 200);
    unit(bystander).hp = 100;

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(bystander).hp).toBe(100);
  });

  it('反射ビームが攻撃元に向かって描画される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // 反射ビーム + 元のフォーカスビーム
    expect(beams.length).toBeGreaterThanOrEqual(2);
    // 反射ビームの終点が攻撃元に向いている
    const reflBeam = beams.find((b) => b.x1 === unit(reflector).x && b.y1 === unit(reflector).y);
    expect(reflBeam).toBeDefined();
    if (reflBeam) {
      expect(reflBeam.x2).toBe(unit(scorcher).x);
      expect(reflBeam.y2).toBe(unit(scorcher).y);
    }
  });

  it('攻撃元が kill される場合', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0);

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    unit(scorcher).hp = 0.01; // ほぼ死亡
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).alive).toBe(false);
  });

  it('Sweep beam + Reflector でバッファ競合なく動作する', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const reflector = spawnAt(1, 6, 200, 0);

    unit(cruiser).target = reflector;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
  });

  it('Sweep中にReflector反射でattackerが死亡 → 例外なく中断', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const reflector = spawnAt(1, 6, 80, 0);

    unit(cruiser).target = reflector;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(cruiser).hp = 0.01; // 反射ダメージで死亡する程度のHP
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
    expect(unit(cruiser).alive).toBe(false);
  });
});

describe('combat — FIELD BEAM REFLECT (reflectFieldHp によるビーム反射)', () => {
  it('フィールド持ち味方がビームを反射しダメージを返却する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0); // Drone (non-reflector)
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const hpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const baseDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0;
    const expectedDmg = baseDmg * REFLECT_BEAM_DAMAGE_MULT;
    expect(unit(scorcher).hp).toBeCloseTo(hpBefore - expectedDmg);
    expect(unit(scorcher).hitFlash).toBe(1);
    // allyのHPは変化しない（反射成功でダメージスキップ）
    expect(unit(ally).hp).toBe(100);
  });

  it('フィールドHPがビームダメージ分減少する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const baseDmg = unitType(12).damage * (1.0 + 0.016 * 0.8) * 1.0;
    expect(unit(ally).reflectFieldHp).toBeCloseTo(REFLECT_FIELD_MAX_HP - baseDmg);
  });

  it('フィールドHP枯渇後はビームが貫通する', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = 0;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    const attackerHpBefore = unit(scorcher).hp;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // 攻撃者のHPは変化しない（反射されない）
    expect(unit(scorcher).hp).toBe(attackerHpBefore);
    // allyはダメージを受ける
    expect(unit(ally).hp).toBeLessThan(100);
  });

  it('反射ダメージで攻撃者がkillされる', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    unit(scorcher).hp = 0.01;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(scorcher).alive).toBe(false);
  });

  it('反射ビームが攻撃元に向かって描画される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    const reflBeam = beams.find((b) => b.x1 === unit(ally).x && b.y1 === unit(ally).y);
    expect(reflBeam).toBeDefined();
    if (reflBeam) {
      expect(reflBeam.x2).toBe(unit(scorcher).x);
      expect(reflBeam.y2).toBe(unit(scorcher).y);
    }
  });

  it('フィールドHPがダメージ以下の場合0に固定される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const ally = spawnAt(1, 1, 0, 0);
    unit(ally).reflectFieldHp = 0.1; // ダメージより小さい

    unit(scorcher).target = ally;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    expect(unit(ally).reflectFieldHp).toBe(0);
  });

  it('Reflector本体のenergy反射がフィールド反射より優先される', () => {
    const scorcher = spawnAt(0, 12, -200, 0);
    const reflector = spawnAt(1, 6, 0, 0); // Reflector本体
    unit(reflector).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    const energyBefore = unit(reflector).energy;

    unit(scorcher).target = reflector;
    unit(scorcher).cooldown = 0;
    unit(scorcher).beamOn = 1.0;
    buildHash();
    combat(unit(scorcher), scorcher, 0.016, 0, rng);

    // Reflector本体のenergyが消費される（tryReflectBeamが先に発火）
    expect(unit(reflector).energy).toBeLessThan(energyBefore);
    // フィールドHPは消費されない
    expect(unit(reflector).reflectFieldHp).toBe(REFLECT_FIELD_MAX_HP);
  });

  it('Sweep Beamがフィールドで反射される', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const ally = spawnAt(1, 1, 80, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;
    unit(ally).hp = 100;

    unit(cruiser).target = ally;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    const cruiserHpBefore = unit(cruiser).hp;
    buildHash();
    combat(unit(cruiser), cruiser, 0.1, 0, rng);

    // Sweep beam が反射されて攻撃者がダメージを受ける
    expect(unit(cruiser).hp).toBeLessThan(cruiserHpBefore);
    // allyのHPは変化しない（反射成功でダメージスキップ）
    expect(unit(ally).hp).toBe(100);
  });

  it('Sweep中にフィールド反射でattackerが死亡 → 例外なく中断', () => {
    const cruiser = spawnAt(0, 3, 0, 0);
    const ally = spawnAt(1, 1, 80, 0);
    unit(ally).reflectFieldHp = REFLECT_FIELD_MAX_HP;

    unit(cruiser).target = ally;
    unit(cruiser).cooldown = 0;
    unit(cruiser).beamOn = 1;
    unit(cruiser).sweepPhase = 0.4;
    unit(cruiser).sweepBaseAngle = 0;
    unit(cruiser).angle = 0;
    unit(cruiser).hp = 0.01;
    buildHash();

    expect(() => {
      combat(unit(cruiser), cruiser, 0.1, 0, rng);
    }).not.toThrow();
    expect(unit(cruiser).alive).toBe(false);
  });
});
