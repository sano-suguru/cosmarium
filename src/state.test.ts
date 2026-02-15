import { afterEach, describe, expect, it } from 'vitest';
import { resetState } from './__test__/pool-helper.ts';
import { beams, getBeam, state } from './state.ts';

afterEach(() => {
  resetState();
});

describe('初期値', () => {
  it('gameState は "menu"', () => {
    expect(state.gameState).toBe('menu');
  });

  it('codexOpen は false', () => {
    expect(state.codexOpen).toBe(false);
  });

  it('codexSelected は 0', () => {
    expect(state.codexSelected).toBe(0);
  });

  it('timeScale は 0.55', () => {
    expect(state.timeScale).toBe(0.55);
  });

  it('reinforcementTimer は 0', () => {
    expect(state.reinforcementTimer).toBe(0);
  });
});

describe('直接代入', () => {
  it('state.gameState を更新できる', () => {
    state.gameState = 'play';
    expect(state.gameState).toBe('play');
  });

  it('state.codexOpen を更新できる', () => {
    state.codexOpen = true;
    expect(state.codexOpen).toBe(true);
    state.codexOpen = false;
    expect(state.codexOpen).toBe(false);
  });

  it('state.codexSelected を更新できる', () => {
    state.codexSelected = 7;
    expect(state.codexSelected).toBe(7);
  });

  it('state.timeScale を更新できる', () => {
    state.timeScale = 2.0;
    expect(state.timeScale).toBe(2.0);
  });

  it('state.reinforcementTimer を更新できる', () => {
    state.reinforcementTimer = 1.5;
    expect(state.reinforcementTimer).toBe(1.5);
  });
});

describe('mutableオブジェクト', () => {
  it('beams は直接 push/length=0 で操作可能', () => {
    expect(beams).toHaveLength(0);
    beams.push({ x1: 0, y1: 0, x2: 1, y2: 1, r: 1, g: 0, b: 0, life: 1, maxLife: 1, width: 1 });
    expect(beams).toHaveLength(1);
  });
});

describe('getBeam', () => {
  it('有効インデックスでBeam返却', () => {
    beams.push({ x1: 10, y1: 20, x2: 30, y2: 40, r: 1, g: 0, b: 0, life: 0.5, maxLife: 0.5, width: 2 });
    const b = getBeam(0);
    expect(b.x1).toBe(10);
    expect(b.y1).toBe(20);
    expect(b.x2).toBe(30);
    expect(b.y2).toBe(40);
  });

  it('範囲外インデックスでRangeError', () => {
    expect(() => getBeam(0)).toThrow(RangeError);
    expect(() => getBeam(-1)).toThrow(RangeError);
  });
});
