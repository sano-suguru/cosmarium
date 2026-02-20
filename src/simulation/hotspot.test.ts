import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { unit } from '../pools.ts';
import { hotspot, resetHotspot, updateHotspot } from './hotspot.ts';

const HOTSPOT_UPDATE_INTERVAL = 6;

function triggerUpdate() {
  for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL; i++) updateHotspot();
}

afterEach(() => {
  resetPools();
  resetState();
  resetHotspot();
});

describe('hotspot', () => {
  it('ユニット0体 → getHotspot() が null', () => {
    triggerUpdate();
    expect(hotspot()).toBeNull();
  });

  it('片方のチームのみ → null', () => {
    for (let i = 0; i < 5; i++) spawnAt(0, 1, 100, 100);
    triggerUpdate();
    expect(hotspot()).toBeNull();
  });

  it('2チーム混在（1セル内） → 正しい座標', () => {
    spawnAt(0, 1, 90, 110);
    spawnAt(0, 1, 110, 90);
    spawnAt(1, 1, 100, 100);
    spawnAt(1, 1, 120, 80);
    triggerUpdate();
    const hs = hotspot();
    expect(hs).not.toBeNull();
    expect(hs?.x).toBeCloseTo(105, 0);
    expect(hs?.y).toBeCloseTo(95, 0);
  });

  it('複数セルで最高スコアのセルが選ばれる', () => {
    spawnAt(0, 1, 50, 50);
    spawnAt(1, 1, 60, 60);

    spawnAt(0, 1, 900, 900);
    spawnAt(0, 1, 920, 920);
    spawnAt(0, 1, 940, 940);
    spawnAt(1, 1, 910, 910);
    spawnAt(1, 1, 930, 930);

    triggerUpdate();
    const hs = hotspot();
    expect(hs).not.toBeNull();
    expect(hs?.x).toBeGreaterThan(800);
    expect(hs?.y).toBeGreaterThan(800);
  });

  it('フレームスキップが動作する', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);
    updateHotspot();
    expect(hotspot()).toBeNull();
    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 1; i++) updateHotspot();
    const hs = hotspot();
    expect(hs).not.toBeNull();
  });

  it('ユニット全滅後 → null に戻る', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);
    triggerUpdate();
    expect(hotspot()).not.toBeNull();

    for (let i = 0; i < 2; i++) {
      const u = unit(i);
      u.alive = false;
    }

    triggerUpdate();
    expect(hotspot()).toBeNull();
  });

  it('resetHotspot がフレームカウンタをリセットする', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);

    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 2; i++) updateHotspot();
    expect(hotspot()).toBeNull();

    resetHotspot();

    updateHotspot();
    expect(hotspot()).toBeNull();

    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 1; i++) updateHotspot();
    expect(hotspot()).not.toBeNull();
  });

  it('連続呼出しでプール再利用時に前回のセルデータが残らない', () => {
    // 1回目: (100,100)付近に2チーム配置 → ホットスポット検出
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);
    triggerUpdate();
    const hs1 = hotspot();
    expect(hs1).not.toBeNull();
    expect(hs1?.x).toBeCloseTo(110, 0);
    expect(hs1?.y).toBeCloseTo(110, 0);

    // ユニット全滅 → 別の場所に再配置
    for (let i = 0; i < 2; i++) unit(i).alive = false;
    spawnAt(0, 1, 800, 800);
    spawnAt(1, 1, 820, 820);

    // 2回目: セルプールが再利用されるが、前回の (100,100) 付近のデータが混入しないこと
    triggerUpdate();
    const hs2 = hotspot();
    expect(hs2).not.toBeNull();
    expect(hs2?.x).toBeGreaterThan(700);
    expect(hs2?.y).toBeGreaterThan(700);
  });

  it('3回連続更新でプール再利用が安定する', () => {
    // 1回目
    spawnAt(0, 1, 50, 50);
    spawnAt(1, 1, 70, 70);
    triggerUpdate();
    expect(hotspot()).not.toBeNull();

    // 全滅→再配置（2回目）
    unit(0).alive = false;
    unit(1).alive = false;
    spawnAt(0, 1, 500, 500);
    spawnAt(1, 1, 520, 520);
    triggerUpdate();
    const hs2 = hotspot();
    expect(hs2).not.toBeNull();
    expect(hs2?.x).toBeGreaterThan(400);

    // 全滅→再配置（3回目）
    for (let i = 0; i < 4; i++) unit(i).alive = false;
    spawnAt(0, 1, 1500, 1500);
    spawnAt(1, 1, 1520, 1520);
    triggerUpdate();
    const hs3 = hotspot();
    expect(hs3).not.toBeNull();
    expect(hs3?.x).toBeGreaterThan(1400);
    expect(hs3?.y).toBeGreaterThan(1400);
  });
});
