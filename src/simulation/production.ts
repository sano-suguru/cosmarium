import { POOL_UNITS } from '../constants.ts';
import { getMothershipDef } from '../mothership-defs.ts';
import { mothershipIdx, mothershipType, poolCounts, teamUnitCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import { getProductionTime, MAX_CLUSTERS_PER_TICK, MAX_SLOT_COUNT } from '../production-config.ts';
import type { Team, TeamTuple } from '../team.ts';
import { NO_UNIT } from '../types.ts';
import type { ProductionSlot, ProductionState } from '../types-fleet.ts';
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

export function emptyProduction(): ProductionState {
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
  hpMul: number,
): boolean {
  if (teamUnitCounts[team] + slot.count > unitCap) {
    return false;
  }
  if (poolCounts.units + slot.count > POOL_UNITS) {
    return false;
  }
  const spread = CLUSTER_SPREAD_BASE + slot.count * CLUSTER_SPREAD_PER_COUNT;
  for (let j = 0; j < slot.count; j++) {
    const idx = spawnUnit(
      team,
      slot.type,
      cx + (rng() - 0.5) * spread,
      cy + (rng() - 0.5) * spread,
      rng,
      slot.mergeExp,
      hpMul,
    );
    if (idx === NO_UNIT) {
      throw new Error('spawnCluster: pool exhaustion after capacity pre-check (invariant violation)');
    }
    assignToSquadron(idx, team);
  }
  return true;
}

let _slotTimer = 0;
let _slotProdTime = 0;

function isSlotReady(ps: ProductionState, i: number, prodTimes: Float64Array): ProductionSlot | null {
  const slot = ps.slots[i];
  if (!slot) {
    return null;
  }
  const timer = ps.timers[i];
  if (timer === undefined) {
    return null;
  }
  const productionTime = prodTimes[i] as number;
  if (timer < productionTime) {
    return null;
  }
  _slotTimer = timer;
  _slotProdTime = productionTime;
  return slot;
}

/** 1パス: 全スロットを走査し、ready なスロットから最大1クラスターずつスポーン。消費した容量を返す */
function roundRobinPass(
  ps: ProductionState,
  team: Team,
  rng: () => number,
  unitCap: number,
  cx: number,
  cy: number,
  capacity: number,
  prodTimes: Float64Array,
  hpMul: number,
): number {
  let spent = 0;
  for (let i = 0; i < ps.slots.length; i++) {
    if (capacity - spent <= 0 || teamUnitCounts[team] >= unitCap) {
      break;
    }
    const slot = isSlotReady(ps, i, prodTimes);
    if (!slot) {
      continue;
    }
    if (spawnCluster(team, slot, rng, unitCap, cx, cy, hpMul)) {
      ps.timers[i] = _slotTimer - _slotProdTime;
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
  hpMul: number,
): void {
  let remainingCapacity = MAX_CLUSTERS_PER_TICK;
  while (remainingCapacity > 0) {
    const spent = roundRobinPass(ps, team, rng, unitCap, cx, cy, remainingCapacity, prodTimes, hpMul);
    if (spent === 0) {
      break;
    }
    remainingCapacity -= spent;
  }
}

const _prodTimesBuf = new Float64Array(MAX_SLOT_COUNT);

function fillProdTimes(
  out: Float64Array,
  ps: ProductionState,
  productionMul: number,
  slotProductionMuls?: readonly number[],
): void {
  if (slotProductionMuls && ps.slots.length > slotProductionMuls.length) {
    throw new RangeError(
      `fillProdTimes: slots.length (${ps.slots.length}) exceeds slotProductionMuls.length (${slotProductionMuls.length})`,
    );
  }
  out.fill(0);
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    const slotMul = slotProductionMuls?.[i] ?? 1.0;
    out[i] = slot ? getProductionTime(slot.type, productionMul / slotMul, slot.mergeExp) : 0;
  }
}

function updateTimers(ps: ProductionState, dt: number, prodTimes: Float64Array): void {
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    if (slot) {
      ps.timers[i] = Math.min((ps.timers[i] ?? 0) + dt, prodTimes[i] as number);
    }
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

  const def = getMothershipDef(mothershipType[team]);

  // スロット数がキャッシュサイズを超えていたらフェイルファスト
  if (ps.slots.length > MAX_SLOT_COUNT) {
    throw new RangeError(
      `tickProduction: slots.length (${ps.slots.length}) exceeds MAX_SLOT_COUNT (${MAX_SLOT_COUNT})`,
    );
  }

  fillProdTimes(_prodTimesBuf, ps, def.productionTimeMul, def.slotProductionMuls);
  updateTimers(ps, dt, _prodTimesBuf);

  // Phase 2 — ラウンドロビンスポーン
  if (teamUnitCounts[team] < unitCap) {
    roundRobinSpawn(ps, team, rng, unitCap, m.x, m.y, _prodTimesBuf, def.unitHpMul);
  }
}
