import { afterEach, describe, expect, it } from 'vitest';
import { resetState } from './__test__/pool-helper.ts';
import {
  asteroids,
  bases,
  beams,
  catalogOpen,
  catSelected,
  gameMode,
  gameState,
  reinforcementTimer,
  setCatalogOpen,
  setCatSelected,
  setGameMode,
  setGameState,
  setReinforcementTimer,
  setTimeScale,
  setWinTeam,
  timeScale,
  winTeam,
} from './state.ts';

afterEach(() => {
  resetState();
});

describe('初期値', () => {
  it('gameState は "menu"', () => {
    expect(gameState).toBe('menu');
  });

  it('gameMode は 0', () => {
    expect(gameMode).toBe(0);
  });

  it('winTeam は -1', () => {
    expect(winTeam).toBe(-1);
  });

  it('catalogOpen は false', () => {
    expect(catalogOpen).toBe(false);
  });

  it('catSelected は 0', () => {
    expect(catSelected).toBe(0);
  });

  it('timeScale は 0.55', () => {
    expect(timeScale).toBe(0.55);
  });

  it('reinforcementTimer は 0', () => {
    expect(reinforcementTimer).toBe(0);
  });
});

describe('setter関数', () => {
  it('setGameState が gameState を更新する', () => {
    setGameState('play');
    expect(gameState).toBe('play');
    setGameState('win');
    expect(gameState).toBe('win');
  });

  it('setGameMode が gameMode を更新する', () => {
    setGameMode(1);
    expect(gameMode).toBe(1);
    setGameMode(2);
    expect(gameMode).toBe(2);
  });

  it('setWinTeam が winTeam を更新する', () => {
    setWinTeam(0);
    expect(winTeam).toBe(0);
    setWinTeam(1);
    expect(winTeam).toBe(1);
  });

  it('setCatalogOpen が catalogOpen を更新する', () => {
    setCatalogOpen(true);
    expect(catalogOpen).toBe(true);
    setCatalogOpen(false);
    expect(catalogOpen).toBe(false);
  });

  it('setCatSelected が catSelected を更新する', () => {
    setCatSelected(7);
    expect(catSelected).toBe(7);
  });

  it('setTimeScale が timeScale を更新する', () => {
    setTimeScale(2.0);
    expect(timeScale).toBe(2.0);
  });

  it('setReinforcementTimer が reinforcementTimer を更新する', () => {
    setReinforcementTimer(1.5);
    expect(reinforcementTimer).toBe(1.5);
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
