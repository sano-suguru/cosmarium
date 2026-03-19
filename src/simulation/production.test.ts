import { beforeEach, describe, expect, it } from 'vitest';
import { fillUnitPool, makeRng, resetPools, resetState } from '../__test__/pool-helper.ts';
import { POOL_UNITS } from '../constants.ts';
import { MAX_MERGE_EXP, MERGE_PRODUCTION_BONUS, MERGE_STAT_BONUS } from '../merge-config.ts';
import { countAliveMotherships, decMotherships, mothershipIdx, registerMothership, teamUnitCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import { createProductionSlot, MAX_CLUSTERS_PER_TICK } from '../production-config.ts';
import type { Team } from '../team.ts';
import { TEAM0 } from '../team.ts';
import type { ProductionSlot } from '../types-fleet.ts';
import { DRONE_TYPE, FIGHTER_TYPE, HIVE_TYPE, REACTOR_TYPE, unitType } from '../unit-type-accessors.ts';
import { computeProductionCap, initProductionState, tickProduction } from './production.ts';
import { spawnUnit } from './spawn.ts';

function setupMothership(rng: () => number, msType = HIVE_TYPE) {
  const idx = spawnUnit(TEAM0, msType, 0, 0, rng);
  registerMothership(TEAM0, idx, msType);
}

const CAP = computeProductionCap(2);

describe('production', () => {
  const rng = makeRng();

  beforeEach(() => {
    resetPools();
    resetState();
    rng.reset();
  });

  it('initProductionState はタイマーを0で初期化', () => {
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 5, mergeExp: 0 },
      { type: FIGHTER_TYPE, count: 3, mergeExp: 0 },
      null,
    ];
    const ps = initProductionState(slots);
    expect(ps.timers).toEqual([0, 0, 0]);
    expect(ps.slots).toEqual(slots);
  });

  it('全スロットが null でもタイマーは初期化される', () => {
    const ps = initProductionState([null, null]);
    expect(ps.timers).toEqual([0, 0]);
  });

  it('tickProduction は独立タイマーで各スロットを並行処理する', () => {
    setupMothership(rng);
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 3, mergeExp: 0 }, // Drone cost=1, productionTime=1*0.7=0.7s
      { type: FIGHTER_TYPE, count: 2, mergeExp: 0 }, // Fighter cost=3, productionTime=3*0.7=2.1s
    ];
    const ps = initProductionState(slots);

    const initialUnits = teamUnitCounts[0];

    // Drone: productionTime = 1 * 0.7 = 0.7s
    // Fighter: productionTime = 3 * 0.7 = 2.1s
    // dt=0.8s → Drone timer=min(0.8, 0.7)=0.7 → spawn 3, timer=0.0; Fighter timer=0.8 < 2.1
    tickProduction(0.8, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + 3); // Drone x3

    // dt=1.4s → Drone timer=min(0.0+1.4, 0.7)=0.7 → 1回 spawn 3, timer=0.0
    //         → Fighter timer=min(0.8+1.4, 2.1)=2.1 → spawn 2, timer=0.0
    tickProduction(1.4, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + 3 + 3 + 2); // Drone 1回×3 + Fighter x2
  });

  it('母艦が撃破されると全スロット生産停止', () => {
    setupMothership(rng);
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: FIGHTER_TYPE, count: 1, mergeExp: 0 },
    ];
    const ps = initProductionState(slots);

    const mIdx = mothershipIdx[0];
    unit(mIdx).alive = false;
    decMotherships(TEAM0);

    const initialUnits = teamUnitCounts[0];
    tickProduction(10.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits); // 何もスポーンしない
  });

  it('MAX_CLUSTERS_PER_TICK でスポーン回数がキャップされる', () => {
    setupMothership(rng, REACTOR_TYPE);
    // 5スロット × count=1 で予算キャップを検証
    // 全スロット ready でも MAX_CLUSTERS_PER_TICK=5 にキャップされる
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
    ];
    const ps = initProductionState(slots);

    const initialUnits = teamUnitCounts[0];

    // dt=1.0s → 全5スロット ready、MAX_CLUSTERS_PER_TICK=5 でちょうどキャップ
    tickProduction(1.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + MAX_CLUSTERS_PER_TICK);
  });

  it('computeProductionCap 到達でスポーン停止', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 1, mergeExp: 0 }];
    const ps = initProductionState(slots);

    // teamUnitCounts を CAP ぎりぎりまで人為的に上げる
    // setupMothership で1機スポーン済みなので、残りを手動スポーン
    for (let i = teamUnitCounts[0]; i < CAP; i++) {
      spawnUnit(TEAM0, DRONE_TYPE, 0, 0, rng);
    }
    expect(teamUnitCounts[0]).toBe(CAP);

    const before = teamUnitCounts[0];
    tickProduction(10.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(before); // キャップで生産停止
  });

  it('computeProductionCap 未到達では通常生産', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 1, mergeExp: 0 }];
    const ps = initProductionState(slots);

    const initial = teamUnitCounts[0];
    expect(initial).toBeLessThan(CAP);
    tickProduction(1.0, TEAM0, rng, ps, CAP); // cost=1, productionTime=1.0s → 1回スポーン
    expect(teamUnitCounts[0]).toBe(initial + 1);
  });

  it('タイマーキャップ: 大量 dt でもタイマーが1周期以内にクランプされる', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [
      { type: FIGHTER_TYPE, count: 1, mergeExp: 0 }, // cost=3, productionTime=3.0s
    ];
    const ps = initProductionState(slots);

    const initialUnits = teamUnitCounts[0];

    // dt=100s → timer=min(100, 3.0)=3.0 → 1回スポーン → timer=0.0（バースト防止）
    tickProduction(100, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + 1);
    expect(ps.timers[0]).toBeCloseTo(0.0, 5);

    // 次の tick で再び大量バーストしないことを確認
    const before = teamUnitCounts[0];
    tickProduction(0.01, TEAM0, rng, ps, CAP); // timer=0.01 < 3.0 → スポーンなし
    expect(teamUnitCounts[0]).toBe(before);
    expect(ps.timers[0]).toBeCloseTo(0.01, 5);
  });

  it('複数スロットの公平性: ラウンドロビンで後方スロットも公平にスポーン', () => {
    setupMothership(rng, REACTOR_TYPE);
    // 3スロットとも Drone(cost=1, productionTime=1.0s)
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
    ];
    const ps = initProductionState(slots);

    const initialUnits = teamUnitCounts[0];
    // dt=1.0s → 全スロットの timer=1.0 >= productionTime=1.0
    // ラウンドロビン: パス1で各1回ずつ(3体), timer=0.0 → パス2では誰も ready でない → 計3体
    tickProduction(1.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + 3);

    // 全スロットが均等にスポーンされたことを確認（タイマーが全て同じ）
    for (const timer of ps.timers) {
      expect(timer).toBeCloseTo(0.0, 5);
    }
  });

  it('グローバルプール満杯でタイマーが凍結される', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 1, mergeExp: 0 }];
    const ps = initProductionState(slots);
    fillUnitPool();
    tickProduction(10.0, TEAM0, rng, ps, CAP);
    expect(ps.timers[0]).toBe(0); // タイマーが進んでいない
  });

  it('null スロットはスキップされ有効スロットのみ処理', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      null,
      { type: DRONE_TYPE, count: 1, mergeExp: 0 },
      null,
    ];
    const ps = initProductionState(slots);
    const initial = teamUnitCounts[0];
    tickProduction(1.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initial + 2); // 有効2スロット分のみ
  });

  it('スロット count > 残りキャパで部分スポーンしない（アトミック性）', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 3, mergeExp: 0 }];
    const ps = initProductionState(slots);
    // CAP - 2 まで埋める（残り2。count=3 はスポーン不可）
    for (let i = teamUnitCounts[0]; i < CAP - 2; i++) {
      spawnUnit(TEAM0, DRONE_TYPE, 0, 0, rng);
    }
    const before = teamUnitCounts[0];
    tickProduction(1.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(before); // 部分スポーンなし
  });

  it('継続生産: タイマーは余剰を持ち越す', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [
      { type: DRONE_TYPE, count: 2, mergeExp: 0 }, // cost=1, productionTime=1.0s
    ];
    const ps = initProductionState(slots);

    const initialUnits = teamUnitCounts[0];

    // 0.8秒 → timer=0.8 < 1.0 → スポーンなし
    tickProduction(0.8, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits);
    expect(ps.timers[0]).toBeCloseTo(0.8, 5);

    // 0.3秒 → timer=min(0.8+0.3, 1.0)=1.0 >= 1.0 → spawn 2, timer=0.0
    tickProduction(0.3, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initialUnits + 2);
    expect(ps.timers[0]).toBeCloseTo(0.0, 5);
  });

  it('mergeExp 付きスロットで生産時間が短縮される', () => {
    setupMothership(rng, REACTOR_TYPE);
    const mergeExp = 5;
    // Drone cost=1, productionMul=1.0 → base=1.0s
    // mergeExp=5 → 1.0 / (1 + 5*MERGE_PRODUCTION_BONUS) ≈ 0.8696s
    const boostedTime = 1.0 / (1 + mergeExp * MERGE_PRODUCTION_BONUS);
    const slots: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 1, mergeExp }];
    const ps = initProductionState(slots);
    const initial = teamUnitCounts[0];

    // boostedTime + 小マージン → spawn
    tickProduction(boostedTime + 0.001, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initial + 1);

    // mergeExp=0 の場合は同じ時間ではスポーンしない（短縮の証拠）
    const slotsNoBoost: (ProductionSlot | null)[] = [{ type: DRONE_TYPE, count: 1, mergeExp: 0 }];
    const psNoBoost = initProductionState(slotsNoBoost);
    const initial2 = teamUnitCounts[0];
    tickProduction(boostedTime + 0.001, TEAM0, rng, psNoBoost, CAP);
    expect(teamUnitCounts[0]).toBe(initial2); // まだスポーンしない
  });

  it('mergeExp 付きスポーンで HP がブーストされる', () => {
    setupMothership(rng, REACTOR_TYPE);
    const slots: (ProductionSlot | null)[] = [{ type: FIGHTER_TYPE, count: 1, mergeExp: 3 }];
    const ps = initProductionState(slots);
    const initial = teamUnitCounts[0];

    tickProduction(10.0, TEAM0, rng, ps, CAP);
    expect(teamUnitCounts[0]).toBe(initial + 1);

    // 最後にスポーンされたユニットの HP を検証
    const fighterType = unitType(FIGHTER_TYPE);
    const expectedMul = 1 + 3 * MERGE_STAT_BONUS;
    // 母艦以降にスポーンされたユニットを探す
    let found = false;
    for (let i = 0; i < POOL_UNITS; i++) {
      const u = unit(i);
      if (u.alive && u.type === FIGHTER_TYPE) {
        expect(u.hp).toBeCloseTo(fighterType.hp * expectedMul);
        expect(u.maxHp).toBeCloseTo(fighterType.hp * expectedMul);
        expect(u.mergeMul).toBeCloseTo(expectedMul);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe('createProductionSlot validation', () => {
  it('mergeExp > MAX_MERGE_EXP で RangeError', () => {
    expect(() => createProductionSlot(DRONE_TYPE, 1, MAX_MERGE_EXP + 1)).toThrow(RangeError);
  });

  it('mergeExp = MAX_MERGE_EXP は正常', () => {
    const slot = createProductionSlot(DRONE_TYPE, 1, MAX_MERGE_EXP);
    expect(slot.mergeExp).toBe(MAX_MERGE_EXP);
  });
});

describe('computeProductionCap', () => {
  it('2チームで POOL_UNITS/2', () => {
    expect(computeProductionCap(2)).toBe(Math.floor(POOL_UNITS / 2));
  });

  it('5チームで POOL_UNITS/5', () => {
    expect(computeProductionCap(5)).toBe(Math.floor(POOL_UNITS / 5));
  });

  it('0チームで RangeError', () => {
    expect(() => computeProductionCap(0)).toThrow(RangeError);
  });

  it('母艦1体撃沈後にキャップが増加する（melee 動的再計算）', () => {
    const rng2 = makeRng();
    resetPools();
    resetState();
    rng2.reset();
    // 3チームで母艦をスポーン
    for (let t = 0; t < 3; t++) {
      const idx = spawnUnit(t as Team, HIVE_TYPE, t * 100, 0, rng2);
      registerMothership(t as Team, idx, HIVE_TYPE);
    }
    // 3チーム全生存 → キャップ = POOL_UNITS / 3
    expect(countAliveMotherships(3)).toBe(3);
    const cap3 = computeProductionCap(3);
    expect(cap3).toBe(Math.floor(POOL_UNITS / 3));

    // team 2 の母艦を撃沈
    const m2 = mothershipIdx[2 as Team];
    unit(m2).alive = false;
    decMotherships(2 as Team);

    // 生存2 → キャップ = POOL_UNITS / 2（増加）
    const alive = countAliveMotherships(3);
    expect(alive).toBe(2);
    const cap2 = computeProductionCap(Math.max(1, alive));
    expect(cap2).toBe(Math.floor(POOL_UNITS / 2));
    expect(cap2).toBeGreaterThan(cap3);
  });
});
