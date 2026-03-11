import { POOL_UNITS } from '../constants.ts';
import { getVariantDef } from '../mothership-variants.ts';
import { mothershipIdx, mothershipVariant, poolCounts, teamUnitCounts, unit } from '../pools.ts';
import { getProductionTime, MAX_CLUSTERS_PER_TICK, SLOT_COUNT } from '../production-config.ts';
import type { ProductionSlot, ProductionState, Team, TeamTuple } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { spawnUnit } from './spawn.ts';
import { assignToSquadron } from './squadron.ts';

export function computeProductionCap(activeTeamCount: number): number {
  if (activeTeamCount < 1) {
    throw new RangeError(`computeProductionCap: activeTeamCount must be >= 1, got ${activeTeamCount}`);
  }
  return Math.floor(POOL_UNITS / activeTeamCount);
}
const CLUSTER_SPREAD_BASE = 60;
const CLUSTER_SPREAD_PER_COUNT = 8;

function emptyProduction(): ProductionState {
  return { slots: [], timers: [] };
}

export function emptyProductions(): TeamTuple<ProductionState> {
  return [emptyProduction(), emptyProduction(), emptyProduction(), emptyProduction(), emptyProduction()];
}

export function initProductionState(slots: readonly (ProductionSlot | null)[]): ProductionState {
  return { slots, timers: slots.map(() => 0) };
}

/** クラスターを一括スポーン。全数配置可能な場合のみスポーンし true を返す（アトミック操作） */
function spawnCluster(
  team: Team,
  slot: ProductionSlot,
  rng: () => number,
  unitCap: number,
  cx: number,
  cy: number,
): boolean {
  if (teamUnitCounts[team] + slot.count > unitCap) {
    return false;
  }
  if (poolCounts.units + slot.count > POOL_UNITS) {
    return false;
  }
  const spread = CLUSTER_SPREAD_BASE + slot.count * CLUSTER_SPREAD_PER_COUNT;
  for (let j = 0; j < slot.count; j++) {
    const idx = spawnUnit(team, slot.type, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
    if (idx === NO_UNIT) {
      throw new Error('spawnCluster: pool exhaustion after capacity pre-check (invariant violation)');
    }
    assignToSquadron(idx, team);
  }
  return true;
}

/** 1パス: 全スロットを走査し、ready なスロットから最大1クラスターずつスポーン。消費した予算を返す */
function roundRobinPass(
  ps: ProductionState,
  team: Team,
  rng: () => number,
  unitCap: number,
  cx: number,
  cy: number,
  budget: number,
  prodTimes: Float64Array,
): number {
  let spent = 0;
  for (let i = 0; i < ps.slots.length; i++) {
    if (budget - spent <= 0 || teamUnitCounts[team] >= unitCap) {
      break;
    }
    const slot = ps.slots[i];
    if (!slot) {
      continue;
    }
    const timer = ps.timers[i];
    if (timer === undefined) {
      continue;
    }
    const productionTime = prodTimes[i] as number;
    if (timer < productionTime) {
      continue;
    }
    if (spawnCluster(team, slot, rng, unitCap, cx, cy)) {
      ps.timers[i] = timer - productionTime;
      spent++;
    }
  }
  return spent;
}

/** ラウンドロビンスポーン: 各パスでスロットあたり最大1クラスターをスポーン */
function roundRobinSpawn(
  ps: ProductionState,
  team: Team,
  rng: () => number,
  unitCap: number,
  cx: number,
  cy: number,
  prodTimes: Float64Array,
): void {
  let spawnBudget = MAX_CLUSTERS_PER_TICK;
  while (spawnBudget > 0) {
    const spent = roundRobinPass(ps, team, rng, unitCap, cx, cy, spawnBudget, prodTimes);
    if (spent === 0) {
      break;
    }
    spawnBudget -= spent;
  }
}

export function tickProduction(dt: number, team: Team, rng: () => number, ps: ProductionState, unitCap: number): void {
  const mIdx = mothershipIdx[team];
  if (mIdx === NO_UNIT) {
    return;
  }
  const m = unit(mIdx);
  if (!m.alive) {
    return;
  }

  // グローバルプール満杯時はスポーン不可能 → タイマー凍結で無駄な計算を回避
  if (poolCounts.units >= POOL_UNITS) {
    return;
  }

  const variantMul = getVariantDef(mothershipVariant[team]).productionRateMul;

  // スロット数がキャッシュサイズを超えていたらフェイルファスト
  if (ps.slots.length > SLOT_COUNT) {
    throw new RangeError(`tickProduction: slots.length (${ps.slots.length}) exceeds SLOT_COUNT (${SLOT_COUNT})`);
  }

  // プリコンピュート: スロットごとの生産時間をローカルキャッシュ
  const prodTimes = new Float64Array(SLOT_COUNT);
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    prodTimes[i] = slot ? getProductionTime(slot.type, variantMul) : 0;
  }

  // Phase 1 — タイマー更新 + クランプ
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    if (slot) {
      ps.timers[i] = Math.min((ps.timers[i] ?? 0) + dt, prodTimes[i] as number);
    }
  }

  // Phase 2 — ラウンドロビンスポーン
  if (teamUnitCounts[team] < unitCap) {
    roundRobinSpawn(ps, team, rng, unitCap, m.x, m.y, prodTimes);
  }
}
