import { beams, getBeam, getTrackingBeam, releaseBeam, releaseTrackingBeam, trackingBeams } from '../beams.ts';
import { REF_FPS } from '../constants.ts';
import { getParticleHWM, getUnitHWM, particle, poolCounts, teamUnitCounts, unit } from '../pools.ts';
import { swapRemove } from '../swap-remove.ts';
import type { ParticleIndex, Team, Unit, UnitIndex } from '../types.ts';
import { unitType, unitTypeIndex } from '../unit-types.ts';
import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail, updateChains } from './effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { killParticle } from './spawn.ts';
import { updateSquadronObjectives } from './squadron.ts';
import { steer } from './steering.ts';
import { applyShieldsAndFields, decayAndRegen } from './update-fields.ts';
import { updateProjectiles } from './update-projectiles.ts';

const SWARM_RADIUS_SQ = 80 * 80;

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

function countSwarmAllies(u: Unit): number {
  const nn = getNeighbors(u.x, u.y, 80);
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

export function updateSwarmN() {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    if (!unitType(u.type).swarm) {
      u.swarmN = 0;
      continue;
    }
    u.swarmN = countSwarmAllies(u);
  }
}

const FLAGSHIP = unitTypeIndex('Flagship');

function emitTrail(u: Unit, rng: () => number) {
  if (u.type === FLAGSHIP) {
    flagshipTrail(u, rng);
  } else {
    trail(u, rng);
  }
}

export function updateUnits(dt: number, now: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    const prevHp = u.hp;
    const wasNotBoosting = u.boostTimer <= 0;
    steer(u, i as UnitIndex, dt, rng);
    combat(u, i as UnitIndex, dt, now, rng);
    if (u.alive && u.hp < prevHp) {
      u.hitFlash = 1;
    }
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
}

export type BattlePhase = 'spectate' | 'battle' | 'melee' | 'battleEnding' | 'meleeEnding' | 'aftermath';

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  battlePhase: BattlePhase;
  activeTeamCount: number;
  updateCodexDemo: (dt: number) => void;
}

/** BATTLE 勝敗判定: 先に team 0 全滅を判定するため相互全滅は DEFEAT 扱い */
function checkBattleWin(): Team | null {
  if (teamUnitCounts[0] === 0) {
    return 1 as Team;
  }
  if (teamUnitCounts[1] === 0) {
    return 0 as Team;
  }
  return null;
}

/** MELEE 勝敗判定: 残存1勢力で勝利、全滅で draw、2勢力以上生存で null（継続） */
function checkMeleeWin(activeTeamCount: number): Team | 'draw' | null {
  let alive = 0;
  let last: Team = 0;
  for (let t = 0; t < activeTeamCount; t++) {
    if (teamUnitCounts[t as Team] > 0) {
      alive++;
      last = t as Team;
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
  updateSwarmN();
  resetReflected();
  updateSquadronObjectives(dt, rng);

  updateUnits(dt, now, rng);
  // updateUnits で hitFlash=1 がセットされた後にディケイする（視覚効果のみ、ロジック影響なし）
  decayAndRegen(dt);

  applyShieldsAndFields(dt);

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
