import { afterEach, describe, expect, it, vi } from 'vitest';
import { asType, resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import type { Team } from '../types.ts';
import { MAX_TEAMS, TEAM0, TEAM1, TEAM2, TEAM3, TEAM4 } from '../types.ts';
import {
  accumulateUnit,
  beginTeamCenterUpdate,
  endTeamCenterUpdate,
  nearestEnemyCenter,
  teamCenterOf,
  updateTeamCenters,
} from './team-center.ts';

vi.mock('../input/camera.ts', () => ({ screenShake: () => undefined }));
vi.mock('../ui/codex.ts', () => ({}));

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

/** テスト用: 指定位置に alive ユニットを配置する */
function placeUnit(team: Team, x: number, y: number) {
  spawnAt(team, asType(0), x, y);
}

describe('updateTeamCenters', () => {
  it('ユニットなしの場合すべてのチームが null を返す', () => {
    updateTeamCenters(MAX_TEAMS);
    for (const t of [TEAM0, TEAM1, TEAM2, TEAM3, TEAM4]) {
      expect(teamCenterOf(t)).toBeNull();
    }
  });

  it('1チーム1ユニットの場合そのユニットの座標が重心', () => {
    placeUnit(0, 100, 200);
    updateTeamCenters(MAX_TEAMS);
    const c = teamCenterOf(0);
    expect(c).not.toBeNull();
    expect(c?.x).toBeCloseTo(100);
    expect(c?.y).toBeCloseTo(200);
  });

  it('同チーム複数ユニットの重心が正しい', () => {
    placeUnit(1, 0, 0);
    placeUnit(1, 100, 200);
    updateTeamCenters(MAX_TEAMS);
    const c = teamCenterOf(1);
    expect(c).not.toBeNull();
    expect(c?.x).toBeCloseTo(50);
    expect(c?.y).toBeCloseTo(100);
  });

  it('異なるチームは独立して計算される', () => {
    placeUnit(0, 10, 20);
    placeUnit(1, 300, 400);
    updateTeamCenters(MAX_TEAMS);
    const c0 = teamCenterOf(0);
    const c1 = teamCenterOf(1);
    expect(c0?.x).toBeCloseTo(10);
    expect(c0?.y).toBeCloseTo(20);
    expect(c1?.x).toBeCloseTo(300);
    expect(c1?.y).toBeCloseTo(400);
  });
});

describe('nearestEnemyCenter', () => {
  it('敵チームがない場合 null を返す', () => {
    placeUnit(0, 0, 0);
    updateTeamCenters(MAX_TEAMS);
    expect(nearestEnemyCenter(0, 0, 0)).toBeNull();
  });

  it('敵チームが1つの場合その重心を返す', () => {
    placeUnit(0, 0, 0);
    placeUnit(1, 100, 0);
    updateTeamCenters(MAX_TEAMS);
    const ec = nearestEnemyCenter(0, 0, 0);
    expect(ec).not.toBeNull();
    expect(ec?.x).toBeCloseTo(100);
    expect(ec?.y).toBeCloseTo(0);
  });

  it('複数敵チームの場合最寄りの重心を返す', () => {
    placeUnit(0, 0, 0);
    placeUnit(1, 500, 0);
    placeUnit(2, 100, 0);
    updateTeamCenters(MAX_TEAMS);
    const ec = nearestEnemyCenter(0, 0, 0);
    expect(ec).not.toBeNull();
    expect(ec?.x).toBeCloseTo(100);
    expect(ec?.y).toBeCloseTo(0);
  });

  it('ユニット位置に応じて最寄りチームが変わる', () => {
    placeUnit(0, 0, 0);
    placeUnit(1, 100, 0);
    placeUnit(2, 500, 0);
    updateTeamCenters(MAX_TEAMS);
    // (0, 0) からはチーム1が近い
    const ec1 = nearestEnemyCenter(0, 0, 0);
    expect(ec1?.x).toBeCloseTo(100);
    // (400, 0) からはチーム2が近い
    const ec2 = nearestEnemyCenter(0, 400, 0);
    expect(ec2?.x).toBeCloseTo(500);
  });
});

describe('3フェーズAPI', () => {
  it('begin/accumulate/end で重心が正しく計算される', () => {
    beginTeamCenterUpdate();
    accumulateUnit(0, 100, 200);
    accumulateUnit(0, 300, 400);
    endTeamCenterUpdate(MAX_TEAMS);
    const c = teamCenterOf(0);
    expect(c).not.toBeNull();
    expect(c?.x).toBeCloseTo(200);
    expect(c?.y).toBeCloseTo(300);
  });

  it('beginTeamCenterUpdate は MAX_TEAMS 分すべてリセットする', () => {
    // まずチーム3にデータを蓄積
    beginTeamCenterUpdate();
    accumulateUnit(3, 999, 999);
    endTeamCenterUpdate(MAX_TEAMS);
    expect(teamCenterOf(TEAM3)).not.toBeNull();
    // 再度 begin → チーム3もリセットされる
    beginTeamCenterUpdate();
    endTeamCenterUpdate(2); // activeTeamCount=2 でもリセットは MAX_TEAMS 分
    expect(teamCenterOf(TEAM3)).toBeNull();
  });

  it('activeTeamCount 外チームのユニットを蓄積してもstaleデータにならない', () => {
    // activeTeamCount=2 だがチーム3に蓄積
    beginTeamCenterUpdate();
    accumulateUnit(3, 500, 500);
    endTeamCenterUpdate(2);
    // チーム3はクエリで null（activeTeamCount 外）
    expect(teamCenterOf(TEAM3)).toBeNull();
    // 次フレーム: begin でリセットされるのでstaleデータなし
    beginTeamCenterUpdate();
    endTeamCenterUpdate(MAX_TEAMS);
    // チーム3はリセット済み → count=0 → null
    expect(teamCenterOf(TEAM3)).toBeNull();
  });
});

describe('activeTeamCount による制限', () => {
  it('activeTeamCount 外のチームは updateTeamCenters で無視される', () => {
    placeUnit(0, 10, 20);
    placeUnit(1, 100, 200);
    placeUnit(2, 300, 400);
    updateTeamCenters(2); // チーム 0, 1 のみ
    expect(teamCenterOf(0)?.x).toBeCloseTo(10);
    expect(teamCenterOf(1)?.x).toBeCloseTo(100);
    expect(teamCenterOf(TEAM2)).toBeNull();
  });

  it('activeTeamCount 外のチームは nearestEnemyCenter で無視される', () => {
    placeUnit(0, 0, 0);
    placeUnit(1, 500, 0);
    placeUnit(2, 100, 0); // 近いがactiveTeamCount外
    updateTeamCenters(2);
    const ec = nearestEnemyCenter(0, 0, 0);
    expect(ec).not.toBeNull();
    expect(ec?.x).toBeCloseTo(500); // チーム1のみ
  });
});
