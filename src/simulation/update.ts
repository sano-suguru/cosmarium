import { BONUS_TIME_LIMIT } from '../bonus-round.ts';
import { NEIGHBOR_RANGE } from '../constants.ts';
import { getMothershipArmament, getMothershipDef, resolveUnitDmgMul } from '../mothership-defs.ts';
import { unitIdx } from '../pool-index.ts';
import {
  countAliveMotherships,
  getUnitHWM,
  mothershipIdx,
  mothershipType,
  poolCounts,
  teamUnitCounts,
} from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Team, TeamTuple } from '../team.ts';
import { TEAM0, TEAM1, TEAMS, teamAt } from '../team.ts';
import type { Armament, BattlePhase, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import type { BonusPhaseData, ProductionState } from '../types-fleet.ts';
import { FLAGSHIP_TYPE, isMothership, unitType } from '../unit-type-accessors.ts';
import { updateChains } from './chain-lightning.ts';
import { combat, combatMothershipTick } from './combat.ts';
import type { MutableTeamCombatMods, ShakeFn } from './combat-context.ts';
import { resetReflected } from './combat-reflect.ts';
import { boostBurst, boostTrail, flagshipTrail, trail } from './effects-trail.ts';
import { computeProductionCap, tickProduction } from './production.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import type { NeighborSlice } from './spatial-hash.ts';
import { buildHash, getNeighbors } from './spatial-hash.ts';
import { updateSquadronObjectives } from './squadron.ts';
import { steerWithNeighbors } from './steering.ts';
import { applyAllFields } from './update-fields.ts';
import { decayAndRegen } from './update-fields-regen.ts';
import { updateProjectiles } from './update-projectiles.ts';
import { updateBeams, updateParticles, updateTrackingBeams } from './update-vfx.ts';
import { checkBattleWin, checkMeleeWin } from './win-check.ts';

/** 全チーム分の生産状態タプル */
export type Productions = TeamTuple<ProductionState>;

const SWARM_RADIUS = 80;
const SWARM_RADIUS_SQ = SWARM_RADIUS * SWARM_RADIUS;

if (SWARM_RADIUS > NEIGHBOR_RANGE) {
  throw new Error(`SWARM_RADIUS (${SWARM_RADIUS}) が NEIGHBOR_RANGE (${NEIGHBOR_RANGE}) を超えています`);
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
  if (u.type === FLAGSHIP_TYPE || isMothership(u.type)) {
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

// チーム単位の母艦情報プリコンピュート用 static 配列（GC 回避でオブジェクト再利用）
const _teamMods: TeamTuple<MutableTeamCombatMods> = [
  { attackCdMul: 1, dmgMul: 1 },
  { attackCdMul: 1, dmgMul: 1 },
  { attackCdMul: 1, dmgMul: 1 },
  { attackCdMul: 1, dmgMul: 1 },
  { attackCdMul: 1, dmgMul: 1 },
];
const _msArmament: TeamTuple<Armament | null> = [null, null, null, null, null];

type WorldStepConfig = {
  activeTeamCount: number;
  isAwakened: (team: Team) => boolean;
};

/** 全チームの母艦攻撃クールダウン倍率・武装をプリコンピュート */
function initializeMothershipStats(config: WorldStepConfig) {
  const { activeTeamCount, isAwakened } = config;
  for (const t of TEAMS) {
    _teamMods[t].attackCdMul = 1;
    _teamMods[t].dmgMul = 1;
    _msArmament[t] = null;
  }
  for (let t = 0; t < activeTeamCount; t++) {
    const team = teamAt(t);
    const awake = isAwakened(team);
    const msDef = getMothershipDef(mothershipType[team]);
    _teamMods[team].attackCdMul = msDef.attackCdMul;
    _teamMods[team].dmgMul = resolveUnitDmgMul(mothershipType[team], awake);
    _msArmament[team] = getMothershipArmament(mothershipType[team]);
  }
}

/** 母艦 or 通常ユニットの戦闘処理を振り分け */
function updateUnitCombat(u: Unit, ui: UnitIndex, dt: number, rng: () => number, shake: ShakeFn) {
  const mods = _teamMods[u.team];
  if (isMothership(u.type)) {
    combatMothershipTick(u, ui, dt, rng, mods, _msArmament[u.team], shake);
  } else {
    combat(u, ui, dt, rng, mods, shake);
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

function processAllUnits(dt: number, rng: () => number, config: WorldStepConfig, shake: ShakeFn) {
  initializeMothershipStats(config);
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    processOneUnit(u, i, dt, rng, shake);
  }
}

export interface GameLoopState extends ReinforcementState, WorldStepConfig {
  battlePhase: BattlePhase;
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
      tickProduction(dt, TEAM0, rng, gs.productions[0], cap, gs.isAwakened(TEAM0));
      tickProduction(dt, TEAM1, rng, gs.productions[1], cap, gs.isAwakened(TEAM1));
      return checkBattleWin();
    }
    case 'melee': {
      const aliveMs = countAliveMotherships(gs.activeTeamCount);
      const cap = computeProductionCap(Math.max(1, aliveMs));
      for (let t = 0; t < gs.activeTeamCount; t++) {
        const team = teamAt(t);
        tickProduction(dt, team, rng, gs.productions[team], cap, gs.isAwakened(team));
      }
      return checkMeleeWin(gs.activeTeamCount);
    }
    case 'bonus': {
      const bd = gs.bonusData;
      if (!bd) {
        throw new Error('bonus phase without bonusData');
      }
      const cap = computeProductionCap(gs.activeTeamCount);
      tickProduction(dt, TEAM0, rng, gs.productions[0], cap, gs.isAwakened(TEAM0));
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

export function stepWorld(dt: number, rng: () => number, config: WorldStepConfig, shake: ShakeFn): void {
  buildHash(config.activeTeamCount);
  resetReflected();
  updateSquadronObjectives(dt, rng);

  processAllUnits(dt, rng, config, shake);
  decayAndRegen(dt);
  applyAllFields(dt);

  updateProjectiles(dt, rng, shake);
  updateParticles(dt);
  updateBeams(dt);
  updateChains(dt, rng, shake);
  updateTrackingBeams(dt);
}

export function stepOnce(
  dt: number,
  rng: () => number,
  gameState: GameLoopState,
  shake: ShakeFn,
): Team | 'draw' | null {
  stepWorld(dt, rng, gameState, shake);
  return stepPhase(dt, rng, gameState);
}
