import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { squad, unit } from '../pools.ts';
import type { Team } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { assignToSquad, getSquadTetherTarget } from './squad.ts';

afterEach(() => {
  resetPools();
  resetState();
});

describe('getSquadTetherTarget', () => {
  it('分隊メンバーはリーダーをターゲットとして返す', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const member = spawnAt(0 as Team, 0, 80, 0);
    assignToSquad(leader, 0 as Team);
    const si = unit(leader).squadIdx;
    unit(member).squadIdx = si;
    squad(si).memberCount++;
    expect(getSquadTetherTarget(unit(member), member)).toBe(leader);
  });

  it('リーダー自身は NO_UNIT を返す', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    assignToSquad(leader, 0 as Team);
    expect(getSquadTetherTarget(unit(leader), leader)).toBe(NO_UNIT);
  });

  it('分隊未所属は NO_UNIT を返す', () => {
    const solo = spawnAt(0 as Team, 0, 0, 0);
    expect(getSquadTetherTarget(unit(solo), solo)).toBe(NO_UNIT);
  });

  it('リーダーが死亡している場合は NO_UNIT を返す', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const member = spawnAt(0 as Team, 0, 80, 0);
    assignToSquad(leader, 0 as Team);
    const si = unit(leader).squadIdx;
    unit(member).squadIdx = si;
    squad(si).memberCount++;
    unit(leader).alive = false;
    expect(getSquadTetherTarget(unit(member), member)).toBe(NO_UNIT);
  });

  it('距離に無関係にターゲットが返される', () => {
    const leader = spawnAt(0 as Team, 0, 0, 0);
    const near = spawnAt(0 as Team, 0, 50, 0);
    const far = spawnAt(0 as Team, 0, 9999, 0);
    assignToSquad(leader, 0 as Team);
    const si = unit(leader).squadIdx;
    unit(near).squadIdx = si;
    unit(far).squadIdx = si;
    squad(si).memberCount += 2;
    expect(getSquadTetherTarget(unit(near), near)).toBe(leader);
    expect(getSquadTetherTarget(unit(far), far)).toBe(leader);
  });
});
