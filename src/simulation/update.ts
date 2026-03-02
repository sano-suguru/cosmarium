import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { REF_FPS } from '../constants.ts';
import { getParticleHWM, getUnitHWM, particle, poolCounts, teamUnitCounts, unit } from '../pools.ts';
import { swapRemove } from '../swap-remove.ts';
import type { ParticleIndex, Team, Unit, UnitIndex } from '../types.ts';
import { TEAMS } from '../types.ts';
import { unitType, unitTypeIndex } from '../unit-types.ts';
import { combat } from './combat.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail, updateChains } from './effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors } from './spatial-hash.ts';
import { killParticle } from './spawn.ts';
import { steer } from './steering.ts';
import { applyShieldsAndFields, decayAndRegen } from './update-fields.ts';
import { updateProjectiles } from './update-projectiles.ts';

const SWARM_RADIUS_SQ = 80 * 80;

export function updateParticles(dt: number) {
  for (let i = 0, rem = poolCounts.particles; i < getParticleHWM() && rem > 0; i++) {
    const pp = particle(i);
    if (!pp.alive) continue;
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
    if (o === u || !o.alive || o.team !== u.team || o.type !== u.type) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy < SWARM_RADIUS_SQ) allies++;
  }
  return Math.min(allies, 6);
}

export function updateSwarmN() {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
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
  if (u.type === FLAGSHIP) flagshipTrail(u, rng);
  else trail(u, rng);
}

export function updateUnits(dt: number, now: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const prevHp = u.hp;
    const wasNotBoosting = u.boostTimer <= 0;
    steer(u, dt, rng);
    combat(u, i as UnitIndex, dt, now, rng);
    if (u.alive && u.hp < prevHp) u.hitFlash = 1;
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + rng() * 0.02;
      emitTrail(u, rng);
    }
    if (u.boostTimer > 0 && u.stun <= 0) {
      boostTrail(u, dt, rng);
      if (wasNotBoosting) boostBurst(u, rng);
    }
  }
}

export type BattlePhase = 'spectate' | 'battle' | 'ending' | 'aftermath';

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  battlePhase: BattlePhase;
  updateCodexDemo: (dt: number) => void;
}

export function stepOnce(dt: number, now: number, rng: () => number, gameState: GameLoopState): Team | null {
  const co = gameState.codexOpen;
  buildHash();
  updateSwarmN();
  resetReflected();

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
      case 'battle': {
        // 勝敗判定: updateUnits → updateProjectiles の全 kill が
        // decUnits() 経由で teamUnitCounts に即時反映された後に到達する。
        // a === 0 (自軍全滅) 時は team 1 勝利。相互全滅も同様（先に a===0 を判定するため DEFEAT 扱い）
        const [a, b] = teamUnitCounts;
        if (a === 0) return TEAMS[1];
        if (b === 0) return TEAMS[0];
        break;
      }
      case 'ending':
      case 'aftermath':
        // 物理のみ継続（増援なし・勝敗判定なし）
        break;
    }
  } else {
    gameState.updateCodexDemo(dt);
  }
  return null;
}
