import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { squadron, unit } from '../pools.ts';
import { NO_UNIT, TEAM0 } from '../types.ts';
import { assignToSquadron, getSquadronTetherTarget } from './squadron.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('getSquadronTetherTarget', () => {
  it('分隊メンバーはリーダーをターゲットとして返す', () => {
    const leader = spawnAt(0, 0, 0, 0);
    const member = spawnAt(0, 0, 80, 0);
    assignToSquadron(leader, TEAM0);
    const si = unit(leader).squadronIdx;
    unit(member).squadronIdx = si;
    squadron(si).memberCount++;
    expect(getSquadronTetherTarget(unit(member), member)).toBe(leader);
  });

  it('リーダー自身は NO_UNIT を返す', () => {
    const leader = spawnAt(0, 0, 0, 0);
    assignToSquadron(leader, TEAM0);
    expect(getSquadronTetherTarget(unit(leader), leader)).toBe(NO_UNIT);
  });

  it('分隊未所属は NO_UNIT を返す', () => {
    const solo = spawnAt(0, 0, 0, 0);
    expect(getSquadronTetherTarget(unit(solo), solo)).toBe(NO_UNIT);
  });

  it('リーダーが死亡している場合は NO_UNIT を返す', () => {
    const leader = spawnAt(0, 0, 0, 0);
    const member = spawnAt(0, 0, 80, 0);
    assignToSquadron(leader, TEAM0);
    const si = unit(leader).squadronIdx;
    unit(member).squadronIdx = si;
    squadron(si).memberCount++;
    unit(leader).alive = false;
    expect(getSquadronTetherTarget(unit(member), member)).toBe(NO_UNIT);
  });

  it('距離に無関係にターゲットが返される', () => {
    const leader = spawnAt(0, 0, 0, 0);
    const near = spawnAt(0, 0, 50, 0);
    const far = spawnAt(0, 0, 9999, 0);
    assignToSquadron(leader, TEAM0);
    const si = unit(leader).squadronIdx;
    unit(near).squadronIdx = si;
    unit(far).squadronIdx = si;
    squadron(si).memberCount += 2;
    expect(getSquadronTetherTarget(unit(near), near)).toBe(leader);
    expect(getSquadronTetherTarget(unit(far), far)).toBe(leader);
  });
});
