import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { SQUADRONS_PER_TEAM } from '../constants.ts';
import { squadronIdx } from '../pool-index.ts';
import { getUnitHWM, squadron, unit } from '../pools.ts';
import type { SquadronIndex } from '../types.ts';
import { NO_SQUADRON, NO_UNIT, TEAM0 } from '../types.ts';
import { DRONE_TYPE, FLAGSHIP_TYPE } from '../unit-type-accessors.ts';
import { buildHash } from './spatial-hash.ts';
import {
  assignToSquadron,
  computeSquadronCohesion,
  computeSquadronLeashFactor,
  formSquadrons,
  onUnitKilled,
  restoreSquadrons,
  snapshotSquadrons,
  succeedLeader,
  updateSquadronObjectives,
} from './squadron.ts';

const rng = () => 0.5;

afterEach(() => {
  resetPools();
  resetState();
});

describe('assignToSquadron', () => {
  it('ユニットを新規分隊に配属し、リーダーに昇格する', () => {
    const idx = spawnAt(0, DRONE_TYPE, 0, 0);
    assignToSquadron(idx, TEAM0);

    const u = unit(idx);
    expect(u.squadronIdx).not.toBe(NO_SQUADRON);

    const s = squadron(u.squadronIdx);
    expect(s.alive).toBe(true);
    expect(s.team).toBe(0);
    expect(s.leader).toBe(idx);
    expect(s.memberCount).toBe(1);
  });

  it('2番目のメンバーは均等配分で別分隊に配属される', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    const b = spawnAt(0, DRONE_TYPE, 10, 0);
    assignToSquadron(a, TEAM0);
    assignToSquadron(b, TEAM0);

    // 均等配分: 別々の分隊に配属
    expect(unit(a).squadronIdx).not.toBe(unit(b).squadronIdx);
    expect(squadron(unit(a).squadronIdx).memberCount).toBe(1);
    expect(squadron(unit(b).squadronIdx).memberCount).toBe(1);
  });
});

describe('formSquadrons', () => {
  it('チーム内の全ユニットが分隊に配属される', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0, DRONE_TYPE, i * 10, 0);
    }
    formSquadrons(TEAM0, getUnitHWM());

    let assigned = 0;
    for (let i = 0; i < getUnitHWM(); i++) {
      const u = unit(i);
      if (u.alive && u.team === 0 && u.squadronIdx !== NO_SQUADRON) {
        assigned++;
      }
    }
    expect(assigned).toBe(8);
  });

  it('各分隊にリーダーが存在する', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0, DRONE_TYPE, i * 10, 0);
    }
    formSquadrons(TEAM0, getUnitHWM());

    const base = 0 * SQUADRONS_PER_TEAM;
    for (let si = base; si < base + SQUADRONS_PER_TEAM; si++) {
      const s = squadron(si);
      if (s.alive) {
        expect(s.leader).not.toBe(NO_UNIT);
      }
    }
  });

  it('均等配分: 8ユニット / 4分隊 → 各2メンバー', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0, DRONE_TYPE, i * 10, 0);
    }
    formSquadrons(TEAM0, getUnitHWM());

    const base = 0 * SQUADRONS_PER_TEAM;
    for (let si = base; si < base + SQUADRONS_PER_TEAM; si++) {
      expect(squadron(si).alive).toBe(true);
      expect(squadron(si).memberCount).toBe(2);
    }
  });
});

/** テスト用: 2ユニットを同一分隊に手動配置する */
function setupColocatedSquadron(a: ReturnType<typeof spawnAt>, b: ReturnType<typeof spawnAt>): SquadronIndex {
  const si = squadronIdx(0);
  const s = squadron(si);
  s.alive = true;
  s.team = TEAM0;
  s.leader = a;
  s.objectiveX = 0;
  s.objectiveY = 0;
  s.objectiveTimer = 5;
  s.memberCount = 2;
  unit(a).squadronIdx = si;
  unit(b).squadronIdx = si;
  return si;
}

describe('succeedLeader', () => {
  it('リーダー死亡時に次の生存メンバーが昇格する', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    const b = spawnAt(0, DRONE_TYPE, 10, 0);
    const si = setupColocatedSquadron(a, b);

    expect(squadron(si).leader).toBe(a);

    // リーダー死亡をシミュレート
    unit(a).alive = false;
    succeedLeader(si, getUnitHWM());

    expect(squadron(si).leader).toBe(b);
  });

  it('リーダー死亡時に最大 mass の生存メンバーが昇格する', () => {
    // type 0 = Drone (mass=1), type 4 = Flagship (mass=30)
    const drone = spawnAt(0, DRONE_TYPE, 0, 0);
    const flagship = spawnAt(0, FLAGSHIP_TYPE, 10, 0);
    const si = squadronIdx(0);
    const s = squadron(si);
    s.alive = true;
    s.team = TEAM0;
    s.leader = drone; // Drone がリーダー
    s.memberCount = 3;
    s.objectiveTimer = 5;
    unit(drone).squadronIdx = si;
    unit(flagship).squadronIdx = si;
    const extra = spawnAt(0, DRONE_TYPE, 20, 0); // もう1体 Drone
    unit(extra).squadronIdx = si;

    // リーダー(Drone)死亡
    unit(drone).alive = false;
    succeedLeader(si, getUnitHWM());

    // Flagship (mass=30) が Drone (mass=1) より優先される
    expect(squadron(si).leader).toBe(flagship);
  });

  it('全メンバー死亡時にリーダーが NO_UNIT になる（消滅判定は onUnitKilled 側）', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    assignToSquadron(a, TEAM0);

    const si = unit(a).squadronIdx;
    unit(a).alive = false;
    succeedLeader(si, getUnitHWM());

    // succeedLeader はリーダー探索のみ — alive 管理は onUnitKilled の責務
    expect(squadron(si).alive).toBe(true);
    expect(squadron(si).leader).toBe(NO_UNIT);
  });
});

describe('onUnitKilled', () => {
  it('memberCount を減少させる', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    const b = spawnAt(0, DRONE_TYPE, 10, 0);
    const si = setupColocatedSquadron(a, b);

    expect(squadron(si).memberCount).toBe(2);

    unit(b).alive = false;
    onUnitKilled(unit(b).squadronIdx, b, getUnitHWM());

    expect(squadron(si).memberCount).toBe(1);
  });

  it('リーダー死亡で後継者が選出される', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    const b = spawnAt(0, DRONE_TYPE, 10, 0);
    const si = setupColocatedSquadron(a, b);

    const squadronIdx = unit(a).squadronIdx;
    unit(a).alive = false;
    onUnitKilled(squadronIdx, a, getUnitHWM());

    expect(squadron(si).leader).toBe(b);
    expect(squadron(si).memberCount).toBe(1);
  });

  it('未所属ユニットの死亡はスキップされる', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    unit(a).alive = false;
    // NO_SQUADRON のまま — エラーなく通過すること
    onUnitKilled(unit(a).squadronIdx, a, getUnitHWM());
  });

  it('最後のメンバー死亡で分隊が消滅する', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    assignToSquadron(a, TEAM0);

    const si = unit(a).squadronIdx;
    const squadronIdx = unit(a).squadronIdx;
    unit(a).alive = false;
    onUnitKilled(squadronIdx, a, getUnitHWM());

    expect(squadron(si).alive).toBe(false);
    expect(squadron(si).leader).toBe(NO_UNIT);
    expect(squadron(si).memberCount).toBe(0);
  });
});

describe('updateSquadronObjectives', () => {
  it('タイマー到達で目標が更新される', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    const enemy = spawnAt(1, DRONE_TYPE, 500, 500);
    assignToSquadron(a, TEAM0);

    const si = unit(a).squadronIdx;
    const s = squadron(si);
    s.objectiveTimer = 0.01;

    buildHash();
    updateSquadronObjectives(0.02, rng);

    // 目標が更新されている（敵中心の500,500付近）
    expect(s.objectiveTimer).toBeGreaterThan(0);
    expect(s.objectiveX).not.toBe(0);
    expect(s.objectiveY).not.toBe(0);
    // enemy 参照を保持（unused lint 回避）
    expect(unit(enemy).alive).toBe(true);
  });

  it('タイマー到達前は目標が変わらない', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    spawnAt(1, DRONE_TYPE, 500, 500);
    assignToSquadron(a, TEAM0);

    const si = unit(a).squadronIdx;
    const s = squadron(si);
    s.objectiveTimer = 10;
    s.objectiveX = 100;
    s.objectiveY = 200;

    buildHash();
    updateSquadronObjectives(0.016, rng);

    expect(s.objectiveX).toBe(100);
    expect(s.objectiveY).toBe(200);
  });
});

describe('snapshotSquadrons / restoreSquadrons', () => {
  it('スナップショットと復元が正しく機能する', () => {
    const a = spawnAt(0, DRONE_TYPE, 0, 0);
    assignToSquadron(a, TEAM0);

    const si = unit(a).squadronIdx;
    squadron(si).objectiveX = 999;

    snapshotSquadrons();

    // 変更
    squadron(si).objectiveX = 0;
    squadron(si).alive = false;

    restoreSquadrons();

    expect(squadron(si).objectiveX).toBe(999);
    expect(squadron(si).alive).toBe(true);
  });
});

describe('squadron-overflow', () => {
  it('全分隊満員時に新ユニットは配属されない', () => {
    // SQUADRONS_PER_TEAM=4, SQUADRON_MAX_SIZE=20 → 80ユニットで満員
    for (let i = 0; i < 80; i++) {
      spawnAt(0, DRONE_TYPE, i * 10, 0);
    }
    formSquadrons(TEAM0, getUnitHWM());

    // 81番目のユニットは配属不可
    const extra = spawnAt(0, DRONE_TYPE, 999, 999);
    assignToSquadron(extra, TEAM0);
    expect(unit(extra).squadronIdx).toBe(NO_SQUADRON);
  });
});

describe('computeSquadronCohesion', () => {
  it('リーダーから離れたメンバーに追従力が発生する', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 300, 0);
    setupColocatedSquadron(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadronCohesion(unit(member), member, out);
    // リーダー(0,0)方向 = 負のx方向への力
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBe(0);
  });

  it('リーダー自身には追従力が発生しない', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 300, 0);
    setupColocatedSquadron(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadronCohesion(unit(leader), leader, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('SQUADRON_COHESION_DIST 以内では追従力はゼロ', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 50, 0); // 50 < SQUADRON_COHESION_DIST(80)
    setupColocatedSquadron(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadronCohesion(unit(member), member, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('未所属ユニットには追従力が発生しない', () => {
    const u = spawnAt(0, DRONE_TYPE, 0, 0);
    // assignToSquadron 未実行 → NO_SQUADRON

    const out = { x: 0, y: 0 };
    computeSquadronCohesion(unit(u), u, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('距離が離れるほど二次的に追従力が増大する', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const memberNear = spawnAt(0, DRONE_TYPE, 200, 0);
    const memberFar = spawnAt(0, DRONE_TYPE, 400, 0);

    // 2体とも同じ分隊に配置（手動で分隊設定）
    const si = squadronIdx(0);
    const s = squadron(si);
    s.alive = true;
    s.team = TEAM0;
    s.leader = leader;
    s.objectiveTimer = 5;
    s.memberCount = 3;
    unit(leader).squadronIdx = si;
    unit(memberNear).squadronIdx = si;
    unit(memberFar).squadronIdx = si;

    const outNear = { x: 0, y: 0 };
    computeSquadronCohesion(unit(memberNear), memberNear, outNear);

    const outFar = { x: 0, y: 0 };
    computeSquadronCohesion(unit(memberFar), memberFar, outFar);

    // 遠い方が大幅に強い力を受ける（二次スケーリング）
    const forceNear = Math.abs(outNear.x);
    const forceFar = Math.abs(outFar.x);
    expect(forceFar).toBeGreaterThan(forceNear * 3);
  });
});

describe('computeSquadronLeashFactor', () => {
  it('リーシュ距離以内では 1 を返す', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 200, 0);
    setupColocatedSquadron(leader, member);

    const factor = computeSquadronLeashFactor(unit(member), member);
    expect(factor).toBe(1);
  });

  it('最大距離以上では 0 を返す', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 600, 0);
    setupColocatedSquadron(leader, member);

    const factor = computeSquadronLeashFactor(unit(member), member);
    expect(factor).toBe(0);
  });

  it('リーシュ距離〜最大距離間では 0〜1 の中間値を返す', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 425, 0); // (350+500)/2 の中間
    setupColocatedSquadron(leader, member);

    const factor = computeSquadronLeashFactor(unit(member), member);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeCloseTo(0.5, 1);
  });

  it('リーダー自身は 1 を返す', () => {
    const leader = spawnAt(0, DRONE_TYPE, 0, 0);
    const member = spawnAt(0, DRONE_TYPE, 500, 0);
    setupColocatedSquadron(leader, member);

    const factor = computeSquadronLeashFactor(unit(leader), leader);
    expect(factor).toBe(1);
  });

  it('未所属ユニットは 1 を返す', () => {
    const u = spawnAt(0, DRONE_TYPE, 0, 0);
    const factor = computeSquadronLeashFactor(unit(u), u);
    expect(factor).toBe(1);
  });
});
