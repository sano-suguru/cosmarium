/**
 * 自動対戦バッチスクリプト — トライアル実行コア
 *
 * CLI エントリーポイントは batch-cli.ts を参照。
 */

import { SIM_DT, WORLD_SIZE } from '../constants.ts';
import { createProductionSlot, filledSlots, SLOT_COUNT } from '../production-config.ts';
import { generateEnemySetup } from '../simulation/enemy-fleet.ts';
import { initBattleProduction, initMeleeProduction } from '../simulation/init.ts';
import { emptyProductions } from '../simulation/production.ts';
import type { GameLoopState } from '../simulation/update.ts';
import { stepOnce } from '../simulation/update.ts';

/** バッチシミュレーションではカメラシェイク不要 */
const _noopShake = () => undefined;

import { getUnitHWM, teamUnitCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import type { Team, TeamTuple } from '../team.ts';
import { teamAt } from '../team.ts';
import type { FleetComposition, FleetSetup, ProductionSlot, ProductionState } from '../types-fleet.ts';
import { HIVE_TYPE } from '../unit-type-accessors.ts';
import { UNIT_TYPE_COUNT } from '../unit-types.ts';
import { collectUnitStats, installAllTrackers } from './batch-tracking.ts';
import type { BatchConfig, KillTracker, TrialResult, TrialSnapshot } from './batch-types.ts';
import { fleetDiversity, ngramEntropy, rleCompressionRatio, spatialEntropy } from './entropy.ts';
import type { BattleStateSnapshot } from './entropy-battle.ts';
import { battleComplexity } from './entropy-battle.ts';

// Trial Execution

function makeBatchGameLoopState(mode: 'battle' | 'melee', activeTeams: number): GameLoopState {
  let reinforcementTimer = 0;
  return {
    battlePhase: mode === 'battle' ? 'battle' : 'melee',
    activeTeamCount: activeTeams,
    get reinforcementTimer() {
      return reinforcementTimer;
    },
    set reinforcementTimer(v: number) {
      reinforcementTimer = v;
    },
    productions: emptyProductions(),
    bonusData: null,
    phaseElapsed: 0,
  };
}

/** ProductionSlot 配列から FleetComposition を導出（diversity/reporting 用） */
function slotsToComposition(slots: readonly (ProductionSlot | null)[]): FleetComposition {
  return filledSlots(slots).map((s) => ({ type: s.type, count: s.count }));
}

/** CLI の FleetComposition → FleetSetup 変換。count は1サイクルの生産数として転用 */
function fleetToSetup(fleet: FleetComposition, mothershipType = HIVE_TYPE): FleetSetup {
  if (fleet.length > SLOT_COUNT) {
    throw new RangeError(`Fleet has ${fleet.length} entries but max ${SLOT_COUNT} slots allowed`);
  }
  const slots: (ProductionSlot | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  for (let i = 0; i < fleet.length; i++) {
    const entry = fleet[i];
    if (entry && entry.count > 0) {
      slots[i] = createProductionSlot(entry.type, entry.count, 0);
    }
  }
  return { mothershipType, slots };
}

function createProductions(
  mode: 'battle' | 'melee',
  rng: () => number,
  setups: FleetSetup[],
  activeTeams: number,
): TeamTuple<ProductionState> {
  if (mode !== 'battle') {
    return initMeleeProduction(rng, setups, activeTeams);
  }
  const s0 = setups[0];
  const s1 = setups[1];
  if (!s0 || !s1) {
    throw new Error('Battle mode requires exactly 2 fleet setups');
  }
  const battleProds = initBattleProduction(rng, s0, s1);
  const base = emptyProductions();
  base[0] = battleProds[0];
  base[1] = battleProds[1];
  return base;
}

function setupFleets(
  config: BatchConfig,
  rng: () => number,
): {
  fleetDiversities: number[];
  fleetCompositions: FleetComposition[];
  setups: FleetSetup[];
  activeTeams: number;
  productions: TeamTuple<ProductionState>;
} {
  const activeTeams = config.mode === 'battle' ? 2 : config.teams;

  if (config.fleets && config.fleets.length !== activeTeams) {
    throw new Error(
      `fleets.length (${config.fleets.length}) must equal the number of active teams (${activeTeams}) in ${config.mode} mode`,
    );
  }

  const fleetDiversities: number[] = [];
  const fleetCompositions: FleetComposition[] = [];
  const setups: FleetSetup[] = [];

  for (let t = 0; t < activeTeams; t++) {
    const cliFleet = config.fleets?.[t];
    const setup = cliFleet ? fleetToSetup(cliFleet) : generateEnemySetup(rng, 1).setup;
    setups.push(setup);
    const comp = slotsToComposition(setup.slots);
    fleetCompositions.push(comp);
    fleetDiversities.push(fleetDiversity(comp));
  }

  const productions = createProductions(config.mode, rng, setups, activeTeams);

  return { fleetDiversities, fleetCompositions, setups, activeTeams, productions };
}

export function runTrial(trialIndex: number, config: BatchConfig): TrialResult {
  const trialSeed = config.seed + trialIndex;
  const rng = config.createRng(trialSeed);

  let currentTime = 0;
  const trackers = installAllTrackers(() => currentTime);

  const { fleetDiversities, fleetCompositions, activeTeams, productions } = setupFleets(config, rng);

  const gs = makeBatchGameLoopState(config.mode, activeTeams);
  gs.productions = productions;
  const snapshots: TrialSnapshot[] = [];
  let winner: Team | 'draw' | null = null;
  let step = 0;

  try {
    for (; step < config.maxSteps; step++) {
      const now = step * SIM_DT;
      currentTime = now;
      const result = stepOnce(SIM_DT, rng, gs, _noopShake);

      if (step % config.snapshotInterval === 0) {
        snapshots.push(takeSnapshot(step, now, activeTeams, trackers.kill));
      }

      if (result !== null) {
        winner = result;
        snapshots.push(takeSnapshot(step, now, activeTeams, trackers.kill));
        break;
      }
    }
  } finally {
    trackers.unsubscribeAll();
  }

  const survivorsByType = countSurvivorsByType(activeTeams);

  const battleSnapshots: BattleStateSnapshot[] = snapshots.map((s) => ({
    teamCounts: s.teamCounts,
    teamKills: s.teamKills,
    spatialEntropy: s.spatial,
  }));

  const size = UNIT_TYPE_COUNT;
  return {
    trialIndex,
    seed: trialSeed,
    winner,
    steps: step,
    elapsed: step * SIM_DT,
    fleetDiversities,
    fleetCompositions,
    snapshots,
    complexity: battleComplexity(battleSnapshots),
    unitStats: collectUnitStats(trackers.spawnedByType, survivorsByType, trackers.kill),
    killMatrix: { data: trackers.kill.killMatrix, size },
    damageStats: { dealtByType: trackers.damage.dealtByType, receivedByType: trackers.damage.receivedByType },
    supportStats: {
      healingByType: trackers.support.healingByType,
      ampApplications: trackers.support.ampApplications,
      scrambleApplications: trackers.support.scrambleApplications,
      catalystApplications: trackers.support.catalystApplications,
    },
    killSequenceEntropy: ngramEntropy(trackers.sequence.sequence, 2),
    killContextStats: { contextCounts: trackers.killContext.contextCounts },
    lifespanStats: { totalLifespan: trackers.lifespan.totalLifespan },
  };
}

// Snapshot Collection

/**
 * 座標収集用の再利用バッファ。`collectPositions` が毎回 `.length = 0` でリセットし
 * push で書き込む。返り値はこの配列自体への参照であり、次の `collectPositions` 呼び出しで
 * 内容が上書きされるため、呼び出し元は即座に消費するか、必要ならコピーすること。
 */
const _posBuf: number[] = [];

/** 座標を再利用バッファ `_posBuf` に収集。返り値は `_posBuf` 自体の参照であり、次の呼び出しで上書きされる */
function collectPositions(activeTeams: number): readonly number[] {
  _posBuf.length = 0;
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.alive && u.team < activeTeams) {
      _posBuf.push(u.x, u.y);
    }
  }
  return _posBuf;
}

function collectTeamCounts(activeTeams: number): Int32Array {
  const counts = new Int32Array(activeTeams);
  for (let t = 0; t < activeTeams; t++) {
    const team = teamAt(t);
    counts[t] = teamUnitCounts[team] ?? 0;
  }
  return counts;
}

function takeSnapshot(step: number, elapsed: number, activeTeams: number, tracker: KillTracker): TrialSnapshot {
  const positions = collectPositions(activeTeams);
  const spatial = spatialEntropy(positions, WORLD_SIZE, 8);
  const positionRle = rleCompressionRatio(positions, 100);
  return {
    step,
    elapsed,
    teamCounts: collectTeamCounts(activeTeams),
    teamKills: tracker.teamKills.slice(0, activeTeams),
    spatial,
    positionRle,
  };
}

function countSurvivorsByType(activeTeams: number): Int32Array {
  const counts = new Int32Array(UNIT_TYPE_COUNT);
  const hwm = getUnitHWM();
  for (let i = 0; i < hwm; i++) {
    const u = unit(i);
    if (u.team < activeTeams && u.alive) {
      counts[u.type] = (counts[u.type] ?? 0) + 1;
    }
  }
  return counts;
}
