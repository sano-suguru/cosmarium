import { vi } from 'vitest';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
import { spawnUnit } from '../simulation/spawn.ts';
import {
  asteroids,
  bases,
  beams,
  setCatalogOpen,
  setCatSelected,
  setGameMode,
  setGameState,
  setReinforcementTimer,
  setTimeScale,
  setWinTeam,
} from '../state.ts';

export function resetPools() {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unitPool[i]!;
    u.alive = false;
    u.team = 0;
    u.type = 0;
    u.x = 0;
    u.y = 0;
    u.vx = 0;
    u.vy = 0;
    u.angle = 0;
    u.hp = 0;
    u.maxHp = 0;
    u.cooldown = 0;
    u.target = -1;
    u.wanderAngle = 0;
    u.trailTimer = 0;
    u.mass = 1;
    u.abilityCooldown = 0;
    u.shielded = false;
    u.stun = 0;
    u.spawnCooldown = 0;
    u.teleportTimer = 0;
    u.beamOn = 0;
    u.kills = 0;
    u.vet = 0;
  }
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = particlePool[i]!;
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.maxLife = 0;
    p.size = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.shape = 0;
  }
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = projectilePool[i]!;
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.damage = 0;
    p.team = 0;
    p.size = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.homing = false;
    p.aoe = 0;
    p.targetIndex = -1;
  }
  poolCounts.unitCount = 0;
  poolCounts.particleCount = 0;
  poolCounts.projectileCount = 0;
  beams.length = 0;
}

export function resetState() {
  setGameState('menu');
  setGameMode(0);
  setWinTeam(-1);
  setCatalogOpen(false);
  setCatSelected(0);
  setTimeScale(0.55);
  setReinforcementTimer(0);
  asteroids.length = 0;
  beams.length = 0;
  // bases の x/y は state.ts で const オブジェクトの初期値として固定されており、テスト中に変更されないためリセット不要
  bases[0].hp = 500;
  bases[0].maxHp = 500;
  bases[1].hp = 500;
  bases[1].maxHp = 500;
}

/** spU() の Math.random 依存（ang, cd, wn）をモックして確定的にユニットを生成する共通ヘルパー */
export function spawnAt(team: 0 | 1, type: number, x: number, y: number): number {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0) // ang
    .mockReturnValueOnce(0) // cd
    .mockReturnValueOnce(0); // wn
  return spawnUnit(team, type, x, y);
}
