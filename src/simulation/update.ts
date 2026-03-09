import { beams, getBeam, getTrackingBeam, releaseBeam, releaseTrackingBeam, trackingBeams } from '../beams.ts';
import { NEIGHBOR_RANGE, REF_FPS } from '../constants.ts';
import { getParticleHWM, getUnitHWM, mothershipIdx, particle, poolCounts, unit } from '../pools.ts';
import { swapRemove } from '../swap-remove.ts';
import type { BattlePhase, ParticleIndex, Team, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT, TEAM0, TEAM1, TEAMS } from '../types.ts';
import { FLAGSHIP_TYPE, MOTHERSHIP_TYPE, unitType } from '../unit-types.ts';
import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail, updateChains } from './effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { killParticle } from './spawn.ts';
import { updateSquadronObjectives } from './squadron.ts';
import { steerWithNeighbors } from './steering.ts';
import { applyAllFields, decayAndRegen } from './update-fields.ts';
import { updateProjectiles } from './update-projectiles.ts';

const SWARM_RADIUS = 80;
const SWARM_RADIUS_SQ = SWARM_RADIUS * SWARM_RADIUS;

// static invariant: SWARM_RADIUS ≤ NEIGHBOR_RANGE（getNeighbors の範囲に収まる必要がある）
if (SWARM_RADIUS > NEIGHBOR_RANGE) {
  throw new Error(`SWARM_RADIUS (${SWARM_RADIUS}) が NEIGHBOR_RANGE (${NEIGHBOR_RANGE}) を超えています`);
}

export function updateParticles(dt: number) {
  for (let i = 0, rem = poolCounts.particles; i < getParticleHWM() && rem > 0; i++) {
    const pp = particle(i);
    if (!pp.alive) {
      continue;
    }
    rem--;
    pp.x += pp.vx * dt;
    pp.y += pp.vy * dt;
    const drag = 0.97 ** (dt * REF_FPS);
    pp.vx *= drag;
    pp.vy *= drag;
    pp.life -= dt;
    if (pp.life <= 0) {
      killParticle(i as ParticleIndex);
    }
  }
}

export function updateBeams(dt: number) {
  for (let i = 0; i < beams.length; ) {
    const bm = getBeam(i);
    bm.life -= dt;
    if (bm.life <= 0) {
      releaseBeam(bm);
      swapRemove(beams, i);
    } else {
      i++;
    }
  }
}

export function updateTrackingBeams(dt: number) {
  for (let i = 0; i < trackingBeams.length; ) {
    const tb = getTrackingBeam(i);
    tb.life -= dt;
    const src = unit(tb.srcUnit);
    const tgt = unit(tb.tgtUnit);
    if (tb.life <= 0 || !src.alive || !tgt.alive || src.team !== tgt.team) {
      releaseTrackingBeam(tb);
      swapRemove(trackingBeams, i);
      continue;
    }
    tb.x1 = src.x;
    tb.y1 = src.y;
    tb.x2 = tgt.x;
    tb.y2 = tgt.y;
    i++;
  }
}

function countSwarmFromNeighbors(u: Unit, nn: number): number {
  let allies = 0;
  for (let j = 0; j < nn; j++) {
    const o = unit(getNeighborAt(j));
    if (o === u || !o.alive || o.team !== u.team || o.type !== u.type) {
      continue;
    }
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy < SWARM_RADIUS_SQ) {
      allies++;
    }
  }
  return Math.min(allies, 6);
}

function emitTrail(u: Unit, rng: () => number) {
  if (u.type === FLAGSHIP_TYPE || u.type === MOTHERSHIP_TYPE) {
    flagshipTrail(u, rng);
  } else {
    trail(u, rng);
  }
}

function processTrailAndBoost(u: Unit, dt: number, rng: () => number, wasNotBoosting: boolean) {
  u.trailTimer -= dt;
  if (u.trailTimer <= 0) {
    u.trailTimer = 0.03 + rng() * 0.02;
    emitTrail(u, rng);
  }
  if (u.boostTimer > 0 && u.stun <= 0) {
    boostTrail(u, dt, rng);
    if (wasNotBoosting) {
      boostBurst(u, rng);
    }
  }
}

function processAllUnits(dt: number, now: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;

    const nn = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
    u.swarmN = unitType(u.type).swarm ? countSwarmFromNeighbors(u, nn) : 0;
    steerWithNeighbors(u, i as UnitIndex, nn, dt, rng);

    const prevHp = u.hp;
    const wasNotBoosting = u.boostTimer <= 0;
    combat(u, i as UnitIndex, dt, now, rng);
    if (u.alive && u.hp < prevHp) {
      u.hitFlash = 1;
    }
    processTrailAndBoost(u, dt, rng, wasNotBoosting);
  }
}

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  battlePhase: BattlePhase;
  activeTeamCount: number;
  updateCodexDemo: (dt: number) => void;
}

/**
 * BATTLE 勝敗判定: 母艦撃沈で決着。先に team 0 母艦を判定するため相互撃沈は DEFEAT 扱い。
 * 残存ユニットは ending フェーズ中に演出として戦闘を継続する（一括除去しない）
 */
function checkBattleWin(): Team | null {
  if (mothershipIdx[0] === NO_UNIT) {
    return TEAM1;
  }
  if (mothershipIdx[1] === NO_UNIT) {
    return TEAM0;
  }
  return null;
}

/**
 * MELEE 勝敗判定: 母艦残存1勢力で勝利、全滅で draw、2勢力以上生存で null（継続）。
 * 残存ユニットは ending フェーズ中に演出として戦闘を継続する（一括除去しない）
 */
function checkMeleeWin(activeTeamCount: number): Team | 'draw' | null {
  let alive = 0;
  let last: Team = TEAM0;
  for (let i = 0; i < activeTeamCount; i++) {
    const t = TEAMS[i];
    if (t !== undefined && mothershipIdx[t] !== NO_UNIT) {
      alive++;
      last = t;
    }
  }
  if (alive === 0) {
    return 'draw';
  }
  if (alive === 1) {
    return last;
  }
  return null;
}

export function stepOnce(dt: number, now: number, rng: () => number, gameState: GameLoopState): Team | 'draw' | null {
  const co = gameState.codexOpen;
  buildHash(gameState.activeTeamCount);
  resetReflected();
  updateSquadronObjectives(dt, rng);

  processAllUnits(dt, now, rng);
  decayAndRegen(dt);
  applyAllFields(dt);

  updateProjectiles(dt, rng);
  updateParticles(dt);
  updateBeams(dt);
  updateChains(dt, rng);
  updateTrackingBeams(dt);

  if (!co) {
    switch (gameState.battlePhase) {
      case 'spectate':
        reinforce(dt, rng, gameState);
        break;
      case 'battle':
        return checkBattleWin();
      case 'melee':
        return checkMeleeWin(gameState.activeTeamCount);
      case 'battleEnding':
      case 'meleeEnding':
      case 'aftermath':
        break;
    }
  } else {
    gameState.updateCodexDemo(dt);
  }
  return null;
}
