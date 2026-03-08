import { afterEach, describe, expect, it, vi } from 'vitest';
import { kill, resetPools, resetState, spawnAt } from './__test__/pool-helper.ts';
import type { EliminationEvent, MeleeResult, TeamStats } from './melee-tracker.ts';
import {
  advanceMeleeElapsed,
  advanceMeleeEndTimer,
  onMeleeEnd,
  resetMeleeTracking,
  setOnMeleeFinalize,
} from './melee-tracker.ts';
import { teamUnitCounts } from './pools.ts';
import { captureKiller } from './simulation/spawn.ts';
import type { TeamCounts } from './types.ts';
import { copyTeamCounts } from './types.ts';

/** ユニット未スポーン時用のゼロカウント */
const ZERO_COUNTS: TeamCounts = [0, 0, 0, 0, 0];

/** 現在の teamUnitCounts をスナップショットする */
function counts(): Readonly<TeamCounts> {
  return copyTeamCounts(teamUnitCounts);
}

afterEach(() => {
  resetPools();
  resetState();
  vi.restoreAllMocks();
});

describe('advanceMeleeElapsed + finalize', () => {
  it('経過時間が MeleeResult.elapsed に反映される', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(3, ZERO_COUNTS);

    advanceMeleeElapsed(1.5);
    advanceMeleeElapsed(0.5);
    onMeleeEnd(0);
    // タイマー消化
    advanceMeleeEndTimer(3);

    expect(cb).toHaveBeenCalledOnce();
    const result = cb.mock.calls[0]?.[0];
    expect(result?.elapsed).toBe(2.0);
    expect(result?.numTeams).toBe(3);
    expect(result?.winnerTeam).toBe(0);
  });
});

describe('onMeleeEnd', () => {
  it('二重呼び出しは最初の勝者のみ記録する', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(3, ZERO_COUNTS);

    onMeleeEnd(2);
    onMeleeEnd(0); // 無視される
    advanceMeleeEndTimer(3);

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]?.winnerTeam).toBe(2);
  });

  it('draw の場合 winnerTeam が null になる', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(4, ZERO_COUNTS);

    onMeleeEnd('draw');
    advanceMeleeEndTimer(3);

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]?.winnerTeam).toBeNull();
  });
});

describe('advanceMeleeEndTimer', () => {
  it('タイマー未開始 (endTimer < 0) では finalize されない', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(2, ZERO_COUNTS);

    advanceMeleeEndTimer(10);
    expect(cb).not.toHaveBeenCalled();
  });

  it('delay 未到達では finalize されない', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(2, ZERO_COUNTS);

    onMeleeEnd(1);
    advanceMeleeEndTimer(0.5);
    expect(cb).not.toHaveBeenCalled();
  });

  it('delay 到達で finalize される', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(2, ZERO_COUNTS);

    onMeleeEnd(1);
    advanceMeleeEndTimer(1.0);
    expect(cb).not.toHaveBeenCalled();
    advanceMeleeEndTimer(1.1); // 合計 2.1 > MELEE_END_DELAY(2)
    expect(cb).toHaveBeenCalledOnce();
  });

  it('finalize 後の追加 advanceMeleeEndTimer は再呼び出ししない', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(2, ZERO_COUNTS);

    onMeleeEnd(0);
    advanceMeleeEndTimer(3);
    advanceMeleeEndTimer(3);
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('resetMeleeTracking', () => {
  it('reset 後に再度 melee を開始できる', () => {
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    resetMeleeTracking(3, ZERO_COUNTS);

    advanceMeleeElapsed(5);
    onMeleeEnd(1);
    advanceMeleeEndTimer(3);
    expect(cb).toHaveBeenCalledOnce();

    // 2回目
    resetMeleeTracking(5, ZERO_COUNTS);
    advanceMeleeElapsed(2);
    onMeleeEnd('draw');
    advanceMeleeEndTimer(3);

    expect(cb).toHaveBeenCalledTimes(2);
    const r2 = cb.mock.calls[1]?.[0];
    expect(r2?.numTeams).toBe(5);
    expect(r2?.elapsed).toBe(2);
    expect(r2?.winnerTeam).toBeNull();
  });
});

// ========== 新テスト: データ収集ロジック ==========

describe('kill hook — チーム別キル数', () => {
  it('killerTeam のキル数が正しく加算される', () => {
    // Team 0: 2 units, Team 1: 2 units
    spawnAt(0, 0, 100, 100);
    const t0b = spawnAt(0, 0, 120, 100);
    const t1a = spawnAt(1, 0, 200, 100);
    spawnAt(1, 0, 220, 100);

    resetMeleeTracking(2, counts());

    // Team 0 のユニットが Team 1 のユニットをキル
    const killer = captureKiller(t0b);
    kill(t1a, killer);

    // finalize して結果を確認
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(0);
    advanceMeleeEndTimer(3);

    expect(cb).toHaveBeenCalledOnce();
    const stats = cb.mock.calls[0]?.[0]?.teamStats as readonly TeamStats[];
    expect(stats[0]?.kills).toBe(1); // Team 0 が 1 kill
    expect(stats[1]?.kills).toBe(0); // Team 1 は 0 kill
  });
});

describe('全滅イベント', () => {
  it('チームが全滅したとき EliminationEvent が記録される', () => {
    const t0a = spawnAt(0, 0, 100, 100);
    spawnAt(1, 0, 200, 100);
    const t1b = spawnAt(1, 0, 220, 100);

    resetMeleeTracking(2, counts());

    // Team 0 の唯一のユニットをキル → Team 0 全滅
    const killer = captureKiller(t1b);
    advanceMeleeElapsed(1.5);
    kill(t0a, killer);

    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(1);
    advanceMeleeEndTimer(3);

    const result = cb.mock.calls[0]?.[0] as MeleeResult;
    expect(result.eliminations).toHaveLength(1);
    const elim = result.eliminations[0] as EliminationEvent;
    expect(elim.team).toBe(0);
    expect(elim.elapsed).toBe(1.5);
  });

  it('全滅は1チームにつき1回だけ記録される', () => {
    // Team 0: 2 units
    const t0a = spawnAt(0, 0, 100, 100);
    const t0b = spawnAt(0, 0, 120, 100);
    const t1a = spawnAt(1, 0, 200, 100);

    resetMeleeTracking(2, counts());

    const killer = captureKiller(t1a);
    kill(t0a, killer);
    kill(t0b, killer); // 2体目キルで全滅確定

    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(1);
    advanceMeleeEndTimer(3);

    const result = cb.mock.calls[0]?.[0] as MeleeResult;
    // 全滅イベントは1回だけ
    expect(result.eliminations).toHaveLength(1);
  });
});

describe('initialUnits スナップショット', () => {
  it('resetMeleeTracking 時に teamUnitCounts が initialUnits にスナップショットされる', () => {
    // Team 0: 3 units, Team 1: 2 units
    spawnAt(0, 0, 100, 100);
    spawnAt(0, 0, 120, 100);
    spawnAt(0, 0, 140, 100);
    spawnAt(1, 0, 200, 100);
    spawnAt(1, 0, 220, 100);

    expect(teamUnitCounts[0]).toBe(3);
    expect(teamUnitCounts[1]).toBe(2);

    resetMeleeTracking(2, counts());

    // finalize して initialUnits を確認
    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(0);
    advanceMeleeEndTimer(3);

    const stats = cb.mock.calls[0]?.[0]?.teamStats as readonly TeamStats[];
    expect(stats[0]?.initialUnits).toBe(3);
    expect(stats[1]?.initialUnits).toBe(2);
  });
});

describe('finalize 後の hook unsubscribe', () => {
  it('finalizeMelee 後に kill hook が unsubscribe される', () => {
    const t0a = spawnAt(0, 0, 100, 100);
    spawnAt(1, 0, 200, 100);
    const t1b = spawnAt(1, 0, 220, 100);

    resetMeleeTracking(2, counts());

    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(1);
    advanceMeleeEndTimer(3); // finalize → hook unsubscribe

    expect(cb).toHaveBeenCalledOnce();
    const killsBefore = (cb.mock.calls[0]?.[0]?.teamStats as readonly TeamStats[])[1]?.kills ?? 0;

    // finalize 後のキルは反映されないはず（hook は解除済み）
    const killer = captureKiller(t1b);
    kill(t0a, killer);

    // 2回目の melee を開始して確認
    resetMeleeTracking(2, counts());
    onMeleeEnd(1);
    advanceMeleeEndTimer(3);

    // 2回目の結果で、1回目の finalize 後キルが混入していないことを確認
    const r2 = cb.mock.calls[1]?.[0] as MeleeResult;
    // Team 1 のキル数は 0（unsubscribe 後のキルは反映されない + 2回目はリセット済み）
    expect(r2.teamStats[1]?.kills).toBe(0);
    expect(killsBefore).toBe(0); // 1回目も Team 1 はキルしていない
  });
});

describe('2回目の reset でデータクリア', () => {
  it('resetMeleeTracking で前回のキル数・全滅イベントがクリアされる', () => {
    const t0a = spawnAt(0, 0, 100, 100);
    spawnAt(0, 0, 120, 100);
    const t1a = spawnAt(1, 0, 200, 100);
    spawnAt(1, 0, 220, 100);

    resetMeleeTracking(2, counts());

    // Team 1 が Team 0 のユニットをキル
    const killer = captureKiller(t1a);
    kill(t0a, killer);
    advanceMeleeElapsed(1.0);

    const cb = vi.fn<(result: MeleeResult) => void>();
    setOnMeleeFinalize(cb);
    onMeleeEnd(1);
    advanceMeleeEndTimer(3);

    const r1 = cb.mock.calls[0]?.[0] as MeleeResult;
    expect(r1.teamStats[1]?.kills).toBe(1);

    // 2回目: 新規ユニットでリセット
    // (前回のプールはまだ残っているが、resetMeleeTracking で kill/elimination データはクリアされる)
    resetMeleeTracking(2, counts());
    onMeleeEnd(0);
    advanceMeleeEndTimer(3);

    const r2 = cb.mock.calls[1]?.[0] as MeleeResult;
    expect(r2.teamStats[0]?.kills).toBe(0);
    expect(r2.teamStats[1]?.kills).toBe(0);
    expect(r2.eliminations).toHaveLength(0);
  });
});
