import { beams, getBeam, getTrackingBeam, releaseBeam, releaseTrackingBeam, trackingBeams } from '../beams.ts';
import { BONUS_TIME_LIMIT } from '../bonus-round.ts';
import { NEIGHBOR_RANGE, REF_FPS } from '../constants.ts';
import { getVariantDef } from '../mothership-variants.ts';
import { particleIdx, unitIdx } from '../pool-index.ts';
import {
  countAliveMotherships,
  getParticleHWM,
  getUnitHWM,
  mothershipIdx,
  mothershipVariant,
  poolCounts,
  teamUnitCounts,
} from '../pools.ts';
import { particle, unit } from '../pools-query.ts';
import { swapRemove } from '../swap-remove.ts';
import type { Team, TeamTuple } from '../team.ts';
import { MAX_TEAMS, TEAM0, TEAM1, teamAt } from '../team.ts';
import type { Armament, BattlePhase, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import type { BonusPhaseData, ProductionState } from '../types-fleet.ts';
import { FLAGSHIP_TYPE, MOTHERSHIP_TYPE, unitType } from '../unit-type-accessors.ts';
import { updateChains } from './chain-lightning.ts';
import { combat, combatMothershipTick } from './combat.ts';
import type { ShakeFn } from './combat-context.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail } from './effects.ts';
import { computeProductionCap, tickProduction } from './production.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import type { NeighborSlice } from './spatial-hash.ts';
import { buildHash, getNeighbors } from './spatial-hash.ts';
import { killParticle } from './spawn.ts';
import { updateSquadronObjectives } from './squadron.ts';
import { steerWithNeighbors } from './steering.ts';
import { applyAllFields } from './update-fields.ts';
import { decayAndRegen } from './update-fields-regen.ts';
import { updateProjectiles } from './update-projectiles.ts';
import { checkBattleWin, checkMeleeWin } from './win-check.ts';

/** 全チーム分の生産状態タプル */
export type Productions = TeamTuple<ProductionState>;

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
      killParticle(particleIdx(i));
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

function countSwarmFromNeighbors(u: Unit, nb: NeighborSlice): number {
  let allies = 0;
  for (let j = 0; j < nb.count; j++) {
    const o = unit(nb.at(j));
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

function processTrailAndBoost(u: Unit, ut: UnitType, dt: number, rng: () => number, wasNotBoosting: boolean) {
  if (ut.trailInterval > 0) {
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + rng() * 0.02;
      emitTrail(u, rng);
    }
  }
  if (u.boostTimer > 0 && u.stun <= 0) {
    boostTrail(u, dt, rng);
    if (wasNotBoosting) {
      boostBurst(u, rng);
    }
  }
}

// チーム単位のバリアント情報プリコンピュート用 static 配列
const _variantAttackCdMul: TeamTuple<number> = [1, 1, 1, 1, 1];
const _variantArmament: TeamTuple<Armament | null> = [null, null, null, null, null];

/** 全チームのバリアント攻撃クールダウン倍率・武装をプリコンピュート */
function initializeVariantStats(activeTeamCount: number) {
  for (let t = 0; t < MAX_TEAMS; t++) {
    _variantAttackCdMul[t] = 1;
    _variantArmament[t] = null;
  }
  for (let t = 0; t < activeTeamCount; t++) {
    const team = teamAt(t);
    const vDef = getVariantDef(mothershipVariant[team]);
    _variantAttackCdMul[team] = vDef.attackCdMul;
    _variantArmament[team] = vDef.armament;
  }
}

/** 母艦 or 通常ユニットの戦闘処理を振り分け */
function updateUnitCombat(u: Unit, ui: UnitIndex, dt: number, rng: () => number, shake: ShakeFn) {
  if (u.type === MOTHERSHIP_TYPE) {
    combatMothershipTick(u, ui, dt, rng, _variantAttackCdMul[u.team], _variantArmament[u.team], shake);
  } else {
    combat(u, ui, dt, rng, _variantAttackCdMul[u.team], shake);
  }
}

function processOneUnit(u: Unit, i: number, dt: number, rng: () => number, shake: ShakeFn) {
  const ut = unitType(u.type);
  if (ut.role === 'environment') {
    return;
  }
  const ui = unitIdx(i);
  const nb = getNeighbors(u.x, u.y, NEIGHBOR_RANGE);
  u.swarmN = ut.swarm ? countSwarmFromNeighbors(u, nb) : 0;
  steerWithNeighbors(u, ui, nb, dt, rng);
  const prevHp = u.hp;
  const wasNotBoosting = u.boostTimer <= 0;
  updateUnitCombat(u, ui, dt, rng, shake);
  if (u.alive && u.hp < prevHp) {
    u.hitFlash = 1;
  }
  processTrailAndBoost(u, ut, dt, rng, wasNotBoosting);
}

function processAllUnits(dt: number, rng: () => number, activeTeamCount: number, shake: ShakeFn) {
  initializeVariantStats(activeTeamCount);
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    processOneUnit(u, i, dt, rng, shake);
  }
}

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  battlePhase: BattlePhase;
  activeTeamCount: number;
  updateCodexDemo: (dt: number) => void;
  productions: Productions;
  bonusData: BonusPhaseData | null;
  phaseElapsed: number;
}

function stepPhase(dt: number, rng: () => number, gs: GameLoopState): Team | 'draw' | null {
  switch (gs.battlePhase) {
    case 'spectate':
      reinforce(dt, rng, gs);
      return null;
    case 'battle': {
      const cap = computeProductionCap(2);
      tickProduction(dt, TEAM0, rng, gs.productions[0], cap);
      tickProduction(dt, TEAM1, rng, gs.productions[1], cap);
      return checkBattleWin();
    }
    case 'melee': {
      const aliveMs = countAliveMotherships(gs.activeTeamCount);
      const cap = computeProductionCap(Math.max(1, aliveMs));
      for (let t = 0; t < gs.activeTeamCount; t++) {
        const team = teamAt(t);
        tickProduction(dt, team, rng, gs.productions[team], cap);
      }
      return checkMeleeWin(gs.activeTeamCount);
    }
    case 'bonus': {
      const bd = gs.bonusData;
      if (!bd) {
        throw new Error('bonus phase without bonusData');
      }
      const cap = computeProductionCap(gs.activeTeamCount);
      tickProduction(dt, TEAM0, rng, gs.productions[0], cap);
      // ボーナスに敗北はない: 母艦撃沈・タイムアップ・全撃破いずれも TEAM0 勝利
      if (mothershipIdx[0] === NO_UNIT || gs.phaseElapsed >= BONUS_TIME_LIMIT || teamUnitCounts[TEAM1] === 0) {
        return TEAM0;
      }
      return null;
    }
    case 'battleEnding':
    case 'meleeEnding':
    case 'aftermath':
      return null;
    default: {
      const _exhaustive: never = gs.battlePhase;
      throw _exhaustive;
    }
  }
}

export function stepOnce(
  dt: number,
  rng: () => number,
  gameState: GameLoopState,
  shake: ShakeFn,
): Team | 'draw' | null {
  buildHash(gameState.activeTeamCount);
  resetReflected();
  updateSquadronObjectives(dt, rng);

  processAllUnits(dt, rng, gameState.activeTeamCount, shake);
  decayAndRegen(dt);
  applyAllFields(dt);

  updateProjectiles(dt, rng, shake);
  updateParticles(dt);
  updateBeams(dt);
  updateChains(dt, rng, shake);
  updateTrackingBeams(dt);

  if (gameState.codexOpen) {
    gameState.updateCodexDemo(dt);
    return null;
  }
  return stepPhase(dt, rng, gameState);
}
