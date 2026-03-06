import { afterEach, describe, expect, it } from 'vitest';
import { addAberration, addFreeze, decayScreenEffects, resetScreenEffects, screenEffects } from './screen-effects.ts';

afterEach(() => {
  resetScreenEffects();
});

describe('addAberration', () => {
  it('強度を設定する', () => {
    addAberration(0.6);
    expect(screenEffects.aberrationIntensity).toBe(0.6);
  });

  it('より大きい強度のみ上書きする', () => {
    addAberration(0.7);
    addAberration(0.2);
    expect(screenEffects.aberrationIntensity).toBe(0.7);
  });
});

describe('addFreeze', () => {
  it('フリーズ時間を設定する', () => {
    addFreeze(0.05);
    expect(screenEffects.freezeTimer).toBe(0.05);
  });

  it('MAX_FREEZE (0.08) で上限クリップする', () => {
    addFreeze(0.2);
    expect(screenEffects.freezeTimer).toBe(0.08);
  });

  it('既存値より大きい場合のみ更新する', () => {
    addFreeze(0.06);
    addFreeze(0.03);
    expect(screenEffects.freezeTimer).toBe(0.06);
  });
});

describe('decayScreenEffects', () => {
  it('aberrationIntensity を指数減衰させる', () => {
    addAberration(1.0);
    decayScreenEffects(0.1);
    expect(screenEffects.aberrationIntensity).toBeLessThan(1.0);
    expect(screenEffects.aberrationIntensity).toBeGreaterThan(0);
  });

  it('aberrationIntensity が閾値 (0.01) 以下でゼロにクリアする', () => {
    addAberration(0.005);
    decayScreenEffects(0.001);
    expect(screenEffects.aberrationIntensity).toBe(0);
  });

  it('freezeTimer を線形減衰させる', () => {
    addFreeze(0.05);
    decayScreenEffects(0.02);
    expect(screenEffects.freezeTimer).toBeCloseTo(0.03);
  });

  it('freezeTimer が 0 以下にならない', () => {
    addFreeze(0.01);
    decayScreenEffects(0.1);
    expect(screenEffects.freezeTimer).toBe(0);
  });
});

describe('resetScreenEffects', () => {
  it('全値を初期状態に戻す', () => {
    addAberration(0.6);
    addFreeze(0.05);
    resetScreenEffects();
    expect(screenEffects.aberrationIntensity).toBe(0);
    expect(screenEffects.freezeTimer).toBe(0);
  });
});
