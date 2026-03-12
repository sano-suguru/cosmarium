import { SORTED_TYPE_INDICES } from '../fleet-cost.ts';
import { createProductionSlot, filledSlots, SLOT_COUNT } from '../production-config.ts';
import { swapRemove } from '../swap-remove.ts';
import type { UnitTypeIndex } from '../types.ts';
import type { FleetSetup, MothershipVariant, ProductionSlot } from '../types-fleet.ts';
import { DRONE_TYPE, unitTypeIndex } from '../unit-type-accessors.ts';
import { TYPES } from '../unit-types.ts';

/** アーキタイプごとの重み定義。キーは TYPES インデックス → 重み(0-10) */
interface Archetype {
  readonly name: string;
  readonly weights: readonly number[];
  readonly variantWeights: readonly [number, number, number]; // [Hive, Dreadnought, Reactor]
}

const NUM_TYPES = TYPES.length;

function w(base: number, overrides: Record<string, number>): readonly number[] {
  const arr = Array.from<number>({ length: NUM_TYPES }).fill(base);
  for (const [name, v] of Object.entries(overrides)) {
    arr[unitTypeIndex(name)] = v;
  }
  return arr;
}

const MIXED: Archetype = { name: '混成型', weights: w(3, {}), variantWeights: [3, 3, 3] };

const ARCHETYPES: readonly Archetype[] = [
  { name: 'スウォーム型', weights: w(1, { Drone: 10, Fighter: 6, Bomber: 2, Healer: 3 }), variantWeights: [5, 1, 2] },
  {
    name: '重装型',
    weights: w(1, { Flagship: 8, Cruiser: 7, Bastion: 6, Carrier: 5, Bomber: 4 }),
    variantWeights: [1, 5, 2],
  },
  {
    name: '奇襲型',
    weights: w(1, { Teleporter: 8, Lancer: 7, Sniper: 7, Disruptor: 5, Scrambler: 4 }),
    variantWeights: [2, 1, 5],
  },
  {
    name: '支援型',
    weights: w(2, { Healer: 8, Amplifier: 7, Catalyst: 7, Bastion: 5, Fighter: 5, Cruiser: 4 }),
    variantWeights: [3, 1, 4],
  },
  {
    name: '防壁型',
    weights: w(1, { Reflector: 8, Disruptor: 7, Bomber: 6, Bastion: 6, Cruiser: 5 }),
    variantWeights: [2, 4, 2],
  },
  MIXED,
];

function pickArchetype(rng: () => number): Archetype {
  const idx = Math.floor(rng() * ARCHETYPES.length);
  return ARCHETYPES[idx] ?? MIXED;
}

/** 累積重み方式でバリアントを選択 */
function pickVariant(arch: Archetype, rng: () => number): MothershipVariant {
  const [w0, w1, w2] = arch.variantWeights;
  let r = rng() * (w0 + w1 + w2);
  r -= w0;
  if (r < 0) {
    return 0;
  }
  r -= w1;
  if (r < 0) {
    return 1;
  }
  return 2;
}

/**
 * 累積重みで候補からランダムに1件選択し、そのインデックスを返す。
 * @precondition candidates は非空かつ少なくとも1要素の weight > 0 であること
 */
function weightedPick(candidates: readonly { weight: number }[], rng: () => number): number {
  let totalW = 0;
  for (const c of candidates) {
    totalW += c.weight;
  }
  if (totalW <= 0) {
    throw new Error('weightedPick: requires candidates with positive total weight');
  }
  let r = rng() * totalW;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c) {
      r -= c.weight;
      if (r < 0) {
        return i;
      }
    }
  }
  return Math.max(0, candidates.length - 1);
}

/** SORTED_TYPE_INDICES から weight > 0 の候補を収集 */
function collectCandidates(arch: Archetype): { idx: UnitTypeIndex; weight: number }[] {
  const candidates: { idx: UnitTypeIndex; weight: number }[] = [];
  for (const idx of SORTED_TYPE_INDICES) {
    const wt = arch.weights[idx] ?? 0;
    if (wt > 0) {
      candidates.push({ idx, weight: wt });
    }
  }
  return candidates;
}

/** 重み付き非復元抽出で SLOT_COUNT タイプを選択し ProductionSlot 配列を返す */
function pickSlots(arch: Archetype, rng: () => number): readonly (ProductionSlot | null)[] {
  const candidates = collectCandidates(arch);

  const slots: (ProductionSlot | null)[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (candidates.length === 0) {
      slots.push(null);
      continue;
    }
    const picked = weightedPick(candidates, rng);
    const entry = candidates[picked];
    if (!entry) {
      slots.push(null);
      continue;
    }
    const clusterSize = TYPES[entry.idx]?.clusterSize ?? 1;
    slots.push(createProductionSlot(entry.idx, clusterSize));
    swapRemove(candidates, picked);
  }

  // 全 null フォールバック: 最低1つの non-null スロットを保証
  if (filledSlots(slots).length === 0) {
    slots[0] = createProductionSlot(DRONE_TYPE, TYPES[DRONE_TYPE]?.clusterSize ?? 1);
  }

  return slots;
}

/**
 * battle 用 — 5スロット+バリアント方式の敵艦隊生成。
 * スロット（ProductionSlot）とバリアントを返し、タイマー駆動の継続生産に使用する。
 */
export function generateEnemySetup(rng: () => number): {
  readonly setup: FleetSetup;
  readonly archetypeName: string;
} {
  const arch = pickArchetype(rng);
  const variant = pickVariant(arch, rng);
  const slots = pickSlots(arch, rng);
  return { setup: { variant, slots }, archetypeName: arch.name };
}
