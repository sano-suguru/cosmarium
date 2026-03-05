import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { SQUADS_PER_TEAM } from '../constants.ts';
import { getUnitHWM, squad, unit } from '../pools.ts';
import type { SquadIndex, Team } from '../types.ts';
import { NO_SQUAD, NO_UNIT } from '../types.ts';
import { buildHash } from './spatial-hash.ts';
import {
  assignToSquad,
  computeSquadCohesion,
  formSquads,
  onUnitKilled,
  restoreSquads,
  snapshotSquads,
  succeedLeader,
  updateSquadObjectives,
} from './squad.ts';

const rng = () => 0.5;

afterEach(() => {
  resetPools();
  resetState();
});

describe('assignToSquad', () => {
  it('ユニットを新規分隊に配属し、リーダーに昇格する', () => {
    const idx = spawnAt(0 as Team, 0, 0, 0);
    assignToSquad(idx, 0 as Team);

    const u = unit(idx);
    expect(u.squadIdx).not.toBe(NO_SQUAD);

    const s = squad(u.squadIdx);
    expect(s.alive).toBe(true);
    expect(s.team).toBe(0);
    expect(s.leader).toBe(idx);
    expect(s.memberCount).toBe(1);
  });

  it('2番目のメンバーは均等配分で別分隊に配属される', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    const b = spawnAt(0 as Team, 0, 10, 0);
    assignToSquad(a, 0 as Team);
    assignToSquad(b, 0 as Team);

    // 均等配分: 別々の分隊に配属
    expect(unit(a).squadIdx).not.toBe(unit(b).squadIdx);
    expect(squad(unit(a).squadIdx).memberCount).toBe(1);
    expect(squad(unit(b).squadIdx).memberCount).toBe(1);
  });
});

describe('formSquads', () => {
  it('チーム内の全ユニットが分隊に配属される', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0 as Team, 0, i * 10, 0);
    }
    formSquads(0 as Team, getUnitHWM());

    let assigned = 0;
    for (let i = 0; i < getUnitHWM(); i++) {
      const u = unit(i);
      if (u.alive && u.team === 0 && u.squadIdx !== NO_SQUAD) {
        assigned++;
      }
    }
    expect(assigned).toBe(8);
  });

  it('各分隊にリーダーが存在する', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0 as Team, 0, i * 10, 0);
    }
    formSquads(0 as Team, getUnitHWM());

    const base = 0 * SQUADS_PER_TEAM;
    for (let si = base; si < base + SQUADS_PER_TEAM; si++) {
      const s = squad(si);
      if (s.alive) {
        expect(s.leader).not.toBe(NO_UNIT);
      }
    }
  });

  it('均等配分: 8ユニット / 4分隊 → 各2メンバー', () => {
    for (let i = 0; i < 8; i++) {
      spawnAt(0 as Team, 0, i * 10, 0);
    }
    formSquads(0 as Team, getUnitHWM());

    const base = 0 * SQUADS_PER_TEAM;
    for (let si = base; si < base + SQUADS_PER_TEAM; si++) {
      expect(squad(si).alive).toBe(true);
      expect(squad(si).memberCount).toBe(2);
    }
  });
});

/** テスト用: 2ユニットを同一分隊に手動配置する */
function setupColocatedSquad(a: ReturnType<typeof spawnAt>, b: ReturnType<typeof spawnAt>): SquadIndex {
  const si = 0 as SquadIndex;
  const s = squad(si);
  s.alive = true;
  s.team = 0 as Team;
  s.leader = a;
  s.objectiveX = 0;
  s.objectiveY = 0;
  s.objectiveTimer = 5;
  s.memberCount = 2;
  unit(a).squadIdx = si;
  unit(b).squadIdx = si;
  return si;
}

describe('succeedLeader', () => {
  it('リーダー死亡時に次の生存メンバーが昇格する', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    const b = spawnAt(0 as Team, 0, 10, 0);
    const si = setupColocatedSquad(a, b);

    expect(squad(si).leader).toBe(a);

    // リーダー死亡をシミュレート
    unit(a).alive = false;
    succeedLeader(si, getUnitHWM());

    expect(squad(si).leader).toBe(b);
  });

  it('リーダー死亡時に最大 mass の生存メンバーが昇格する', () => {
    // type 0 = Drone (mass=1), type 4 = Flagship (mass=30)
    const drone = spawnAt(0 as Team, 0, 0, 0);
    const flagship = spawnAt(0 as Team, 4, 10, 0);
    const si = 0 as SquadIndex;
    const s = squad(si);
    s.alive = true;
    s.team = 0 as Team;
    s.leader = drone; // Drone がリーダー
    s.memberCount = 3;
    s.objectiveTimer = 5;
    unit(drone).squadIdx = si;
    unit(flagship).squadIdx = si;
    const extra = spawnAt(0 as Team, 0, 20, 0); // もう1体 Drone
    unit(extra).squadIdx = si;

    // リーダー(Drone)死亡
    unit(drone).alive = false;
    succeedLeader(si, getUnitHWM());

    // Flagship (mass=30) が Drone (mass=1) より優先される
    expect(squad(si).leader).toBe(flagship);
  });

  it('全メンバー死亡時にリーダーが NO_UNIT になる（消滅判定は onUnitKilled 側）', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    assignToSquad(a, 0 as Team);

    const si = unit(a).squadIdx;
    unit(a).alive = false;
    succeedLeader(si, getUnitHWM());

    // succeedLeader はリーダー探索のみ — alive 管理は onUnitKilled の責務
    expect(squad(si).alive).toBe(true);
    expect(squad(si).leader).toBe(NO_UNIT);
  });
});

describe('onUnitKilled', () => {
  it('memberCount を減少させる', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    const b = spawnAt(0 as Team, 0, 10, 0);
    const si = setupColocatedSquad(a, b);

    expect(squad(si).memberCount).toBe(2);

    unit(b).alive = false;
    onUnitKilled(unit(b).squadIdx, b, getUnitHWM());

    expect(squad(si).memberCount).toBe(1);
  });

  it('リーダー死亡で後継者が選出される', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    const b = spawnAt(0 as Team, 0, 10, 0);
    const si = setupColocatedSquad(a, b);

    const squadIdx = unit(a).squadIdx;
    unit(a).alive = false;
    onUnitKilled(squadIdx, a, getUnitHWM());

    expect(squad(si).leader).toBe(b);
    expect(squad(si).memberCount).toBe(1);
  });

  it('未所属ユニットの死亡はスキップされる', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    unit(a).alive = false;
    // NO_SQUAD のまま — エラーなく通過すること
    onUnitKilled(unit(a).squadIdx, a, getUnitHWM());
  });

  it('最後のメンバー死亡で分隊が消滅する', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    assignToSquad(a, 0 as Team);

    const si = unit(a).squadIdx;
    const squadIdx = unit(a).squadIdx;
    unit(a).alive = false;
    onUnitKilled(squadIdx, a, getUnitHWM());

    expect(squad(si).alive).toBe(false);
    expect(squad(si).leader).toBe(NO_UNIT);
    expect(squad(si).memberCount).toBe(0);
  });
});

describe('updateSquadObjectives', () => {
  it('タイマー到達で目標が更新される', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    const enemy = spawnAt(1 as Team, 0, 500, 500);
    assignToSquad(a, 0 as Team);

    const si = unit(a).squadIdx;
    const s = squad(si);
    s.objectiveTimer = 0.01;

    buildHash();
    updateSquadObjectives(0.02, rng);

    // 目標が更新されている（敵中心の500,500付近）
    expect(s.objectiveTimer).toBeGreaterThan(0);
    expect(s.objectiveX).not.toBe(0);
    expect(s.objectiveY).not.toBe(0);
    // enemy 参照を保持（unused lint 回避）
    expect(unit(enemy).alive).toBe(true);
  });

  it('タイマー到達前は目標が変わらない', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    spawnAt(1 as Team, 0, 500, 500);
    assignToSquad(a, 0 as Team);

    const si = unit(a).squadIdx;
    const s = squad(si);
    s.objectiveTimer = 10;
    s.objectiveX = 100;
    s.objectiveY = 200;

    buildHash();
    updateSquadObjectives(0.016, rng);

    expect(s.objectiveX).toBe(100);
    expect(s.objectiveY).toBe(200);
  });
});

describe('snapshotSquads / restoreSquads', () => {
  it('スナップショットと復元が正しく機能する', () => {
    const a = spawnAt(0 as Team, 0, 0, 0);
    assignToSquad(a, 0 as Team);

    const si = unit(a).squadIdx;
    squad(si).objectiveX = 999;

    snapshotSquads();

    // 変更
    squad(si).objectiveX = 0;
    squad(si).alive = false;

    restoreSquads();

    expect(squad(si).objectiveX).toBe(999);
    expect(squad(si).alive).toBe(true);
  });
});

describe('squad-overflow', () => {
  it('全分隊満員時に新ユニットは配属されない', () => {
    // SQUADS_PER_TEAM=4, SQUAD_MAX_SIZE=20 → 80ユニットで満員
    for (let i = 0; i < 80; i++) {
      spawnAt(0 as Team, 0, i * 10, 0);
    }
    formSquads(0 as Team, getUnitHWM());

    // 81番目のユニットは配属不可
    const extra = spawnAt(0 as Team, 0, 999, 999);
    assignToSquad(extra, 0 as Team);
    expect(unit(extra).squadIdx).toBe(NO_SQUAD);
  });
});

describe('computeSquadCohesion', () => {
  it('リーダーから離れたメンバーに追従力が発生する', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const member = spawnAt(0 as Team, 0, 300, 0);
    setupColocatedSquad(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadCohesion(unit(member), member, out);
    // リーダー(0,0)方向 = 負のx方向への力
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBe(0);
  });

  it('リーダー自身には追従力が発生しない', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const member = spawnAt(0 as Team, 0, 300, 0);
    setupColocatedSquad(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadCohesion(unit(leader), leader, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('SQUAD_COHESION_DIST 以内では追従力はゼロ', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const member = spawnAt(0 as Team, 0, 50, 0); // 50 < SQUAD_COHESION_DIST(120)
    setupColocatedSquad(leader, member);

    const out = { x: 0, y: 0 };
    computeSquadCohesion(unit(member), member, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('未所属ユニットには追従力が発生しない', () => {
    const u = spawnAt(0 as Team, 0, 0, 0);
    // assignToSquad 未実行 → NO_SQUAD

    const out = { x: 0, y: 0 };
    computeSquadCohesion(unit(u), u, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});
