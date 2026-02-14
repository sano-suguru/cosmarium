import { afterEach, describe, expect, it } from 'vitest';
import { resetState } from './__test__/pool-helper.ts';
import { asteroids, bases, beams, state } from './state.ts';

afterEach(() => {
  resetState();
});

describe('初期値', () => {
  it('gameState は "menu"', () => {
    expect(state.gameState).toBe('menu');
  });

  it('gameMode は 0', () => {
    expect(state.gameMode).toBe(0);
  });

  it('winTeam は -1', () => {
    expect(state.winTeam).toBe(-1);
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
    state.gameState = 'win';
    expect(state.gameState).toBe('win');
  });

  it('state.gameMode を更新できる', () => {
    state.gameMode = 1;
    expect(state.gameMode).toBe(1);
    state.gameMode = 2;
    expect(state.gameMode).toBe(2);
  });

  it('state.winTeam を更新できる', () => {
    state.winTeam = 0;
    expect(state.winTeam).toBe(0);
    state.winTeam = 1;
    expect(state.winTeam).toBe(1);
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

  it('asteroids は直接操作可能', () => {
    expect(asteroids).toHaveLength(0);
    asteroids.push({ x: 100, y: 200, radius: 30, angle: 0, angularVelocity: 0.1 });
    expect(asteroids).toHaveLength(1);
  });

  it('bases は初期構造を持つ (x=±1800, hp=500)', () => {
    expect(bases).toHaveLength(2);
    expect(bases[0]).toEqual({ x: -1800, y: 0, hp: 500, maxHp: 500 });
    expect(bases[1]).toEqual({ x: 1800, y: 0, hp: 500, maxHp: 500 });
  });

  it('bases の hp は直接変更可能', () => {
    bases[0].hp = 100;
    expect(bases[0].hp).toBe(100);
    bases[1].hp = 0;
    expect(bases[1].hp).toBe(0);
  });
});
