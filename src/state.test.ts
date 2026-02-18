import { afterEach, describe, expect, it } from 'vitest';
import { resetState } from './__test__/pool-helper.ts';
import { beams, getBeam } from './beams.ts';
import { getSeed, rng, seedRng, state } from './state.ts';

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

  it('timeScale は 1', () => {
    expect(state.timeScale).toBe(1);
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

describe('PRNG (mulberry32)', () => {
  it('rng() は [0, 1) の数値を返す', () => {
    seedRng(42);
    const value = rng();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it('rng() は連続呼び出しで異なる値を返す', () => {
    seedRng(42);
    const first = rng();
    const second = rng();
    const third = rng();
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(first).not.toBe(third);
  });

  it('同じシードで同じシーケンスが得られる', () => {
    seedRng(12345);
    const seq1 = [rng(), rng(), rng(), rng(), rng()];

    seedRng(12345);
    const seq2 = [rng(), rng(), rng(), rng(), rng()];

    expect(seq1).toEqual(seq2);
  });

  it('異なるシードで異なるシーケンスが得られる', () => {
    seedRng(111);
    const seq1 = [rng(), rng(), rng()];

    seedRng(222);
    const seq2 = [rng(), rng(), rng()];

    expect(seq1).not.toEqual(seq2);
  });

  it('seedRng() でシーケンスがリセットされる', () => {
    seedRng(999);
    const first = rng();

    seedRng(999);
    const reset = rng();

    expect(first).toBe(reset);
  });

  it('getSeed() は現在のシードを返す', () => {
    seedRng(7777);
    expect(getSeed()).toBe(7777);

    seedRng(8888);
    expect(getSeed()).toBe(8888);
  });

  it('state.rng は直接呼び出せる', () => {
    seedRng(555);
    const value = state.rng();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  it('state.rng プロパティはテストでオーバーライド可能', () => {
    state.rng = () => 0.75;
    expect(state.rng()).toBe(0.75);
    expect(rng()).toBe(0.75);

    seedRng(42);
    expect(rng()).not.toBe(0.75);
  });

  it('100回連続呼び出しが [0, 1) 範囲内', () => {
    seedRng(12321);
    const samples = Array.from({ length: 100 }, () => rng());

    expect(samples.every((v) => v >= 0 && v < 1)).toBe(true);
    const unique = new Set(samples);
    expect(unique.size).toBeGreaterThan(90);
  });
});
