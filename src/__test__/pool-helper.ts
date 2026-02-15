import { vi } from 'vitest';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import {
  getParticle,
  getProjectile,
  getUnit,
  resetPoolCounts,
  setParticleCountForTest,
  setProjectileCountForTest,
  setUnitCountForTest,
} from '../pools.ts';
import { spawnUnit } from '../simulation/spawn.ts';
import type { State } from '../state.ts';
import { beams, state } from '../state.ts';
import type { UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';

export function resetPools() {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
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
    u.target = NO_UNIT;
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
    const p = getParticle(i);
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
    const p = getProjectile(i);
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
    p.targetIndex = NO_UNIT;
  }
  resetPoolCounts();
  beams.length = 0;
}

/** プールを意図的に満杯にするテスト専用ヘルパー。Readonly<> を bypass するため型キャストを使用 */
export function fillUnitPool() {
  for (let i = 0; i < POOL_UNITS; i++) getUnit(i).alive = true;
  setUnitCountForTest(POOL_UNITS);
}

export function fillParticlePool() {
  for (let i = 0; i < POOL_PARTICLES; i++) getParticle(i).alive = true;
  setParticleCountForTest(POOL_PARTICLES);
}

export function fillProjectilePool() {
  for (let i = 0; i < POOL_PROJECTILES; i++) getProjectile(i).alive = true;
  setProjectileCountForTest(POOL_PROJECTILES);
}

const stateDefaults: State = {
  gameState: 'menu',
  codexOpen: false,
  codexSelected: 0,
  timeScale: 0.55,
  reinforcementTimer: 0,
};

export function resetState() {
  Object.assign(state, stateDefaults);
  beams.length = 0;
}

/** spawnUnit() の Math.random 依存（angle, cooldown, wanderAngle）をモックして確定的にユニットを生成する共通ヘルパー */
export function spawnAt(team: 0 | 1, type: number, x: number, y: number): UnitIndex {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0) // angle
    .mockReturnValueOnce(0) // cooldown
    .mockReturnValueOnce(0); // wanderAngle
  return spawnUnit(team, type, x, y);
}
