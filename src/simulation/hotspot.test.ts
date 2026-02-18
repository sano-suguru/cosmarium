import { afterEach, describe, expect, it } from 'vitest';
import { resetPools, resetState, spawnAt } from '../__test__/pool-helper.ts';
import { getUnit } from '../pools.ts';
import { getHotspot, resetHotspot, updateHotspot } from './hotspot.ts';

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
    expect(getHotspot()).toBeNull();
  });

  it('片方のチームのみ → null', () => {
    for (let i = 0; i < 5; i++) spawnAt(0, 1, 100, 100);
    triggerUpdate();
    expect(getHotspot()).toBeNull();
  });

  it('2チーム混在（1セル内） → 正しい座標', () => {
    spawnAt(0, 1, 90, 110);
    spawnAt(0, 1, 110, 90);
    spawnAt(1, 1, 100, 100);
    spawnAt(1, 1, 120, 80);
    triggerUpdate();
    const hs = getHotspot();
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
    const hs = getHotspot();
    expect(hs).not.toBeNull();
    expect(hs?.x).toBeGreaterThan(800);
    expect(hs?.y).toBeGreaterThan(800);
  });

  it('フレームスキップが動作する', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);
    updateHotspot();
    expect(getHotspot()).toBeNull();
    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 1; i++) updateHotspot();
    const hs = getHotspot();
    expect(hs).not.toBeNull();
  });

  it('ユニット全滅後 → null に戻る', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);
    triggerUpdate();
    expect(getHotspot()).not.toBeNull();

    for (let i = 0; i < 2; i++) {
      const u = getUnit(i);
      u.alive = false;
    }

    triggerUpdate();
    expect(getHotspot()).toBeNull();
  });

  it('resetHotspot がフレームカウンタをリセットする', () => {
    spawnAt(0, 1, 100, 100);
    spawnAt(1, 1, 120, 120);

    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 2; i++) updateHotspot();
    expect(getHotspot()).toBeNull();

    resetHotspot();

    updateHotspot();
    expect(getHotspot()).toBeNull();

    for (let i = 0; i < HOTSPOT_UPDATE_INTERVAL - 1; i++) updateHotspot();
    expect(getHotspot()).not.toBeNull();
  });
});
