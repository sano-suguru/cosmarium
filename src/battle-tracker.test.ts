import { describe, expect, it } from 'vitest';
import type { BattleSourcePhase } from './battle-tracker.ts';
import {
  _resetBattleTracker,
  advanceBattleEndTimer,
  onBattleEnd,
  resetBattleTracking,
  setOnFinalize,
} from './battle-tracker.ts';
import type { Team } from './team.ts';
import type { BattleResult, BattleSnapshot } from './types-fleet.ts';

const snap = (survivors: number, enemyKills: number): BattleSnapshot => ({ survivors, enemyKills });

describe('battle-tracker finalization', () => {
  it('fire-once: onFinalize は1回だけ呼ばれる', () => {
    _resetBattleTracker();
    const calls: { result: BattleResult; sourcePhase: BattleSourcePhase }[] = [];
    setOnFinalize((result, sourcePhase) => {
      calls.push({ result, sourcePhase });
    });

    onBattleEnd(0 as Team, snap(5, 3));

    // タイマー消化
    advanceBattleEndTimer(3);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.result.victory).toBe(true);
    expect(calls[0]?.result.playerSurvivors).toBe(5);
    expect(calls[0]?.result.enemyKills).toBe(3);

    // 追加の advanceBattleEndTimer は finalize を再発火しない
    advanceBattleEndTimer(3);
    expect(calls).toHaveLength(1);
  });

  it('sourcePhase 束縛: resetBattleTracking("bonus") → finalize で sourcePhase === "bonus"', () => {
    _resetBattleTracker();
    const phases: BattleSourcePhase[] = [];
    setOnFinalize((_result, sourcePhase) => {
      phases.push(sourcePhase);
    });

    resetBattleTracking('bonus');
    onBattleEnd(0 as Team, snap(1, 0));
    advanceBattleEndTimer(3);

    expect(phases).toEqual(['bonus']);
  });

  it('sourcePhase 束縛: resetBattleTracking("pve") → finalize で sourcePhase === "pve"', () => {
    _resetBattleTracker();
    const phases: BattleSourcePhase[] = [];
    setOnFinalize((_result, sourcePhase) => {
      phases.push(sourcePhase);
    });

    resetBattleTracking('pve');
    onBattleEnd(0 as Team, snap(5, 3));
    advanceBattleEndTimer(3);

    expect(phases).toEqual(['pve']);
  });

  it('sourcePhase 束縛: resetBattleTracking("boss") → finalize で sourcePhase === "boss"', () => {
    _resetBattleTracker();
    const phases: BattleSourcePhase[] = [];
    setOnFinalize((_result, sourcePhase) => {
      phases.push(sourcePhase);
    });

    resetBattleTracking('boss');
    onBattleEnd(0 as Team, snap(5, 3));
    advanceBattleEndTimer(3);

    expect(phases).toEqual(['boss']);
  });

  it('二重 onBattleEnd ガード: 2回目は無視される', () => {
    _resetBattleTracker();
    const calls: BattleResult[] = [];
    setOnFinalize((result) => {
      calls.push(result);
    });

    onBattleEnd(0 as Team, snap(10, 5));
    onBattleEnd(1 as Team, snap(0, 0)); // 2回目 — 無視される

    advanceBattleEndTimer(3);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.victory).toBe(true);
    expect(calls[0]?.playerSurvivors).toBe(10);
  });

  it('resetBattleTracking 後は clean slate: pending が null', () => {
    _resetBattleTracker();
    const calls: BattleResult[] = [];
    setOnFinalize((result) => {
      calls.push(result);
    });

    onBattleEnd(0 as Team, snap(5, 3));
    resetBattleTracking();

    advanceBattleEndTimer(3);

    // リセット後は finalize されない
    expect(calls).toHaveLength(0);
  });
});
