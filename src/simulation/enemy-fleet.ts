import type { FleetComposition, FleetEntry } from '../types.ts';
import { TYPES, unitTypeIndex } from '../unit-types.ts';

/** アーキタイプごとの重み定義。キーは TYPES インデックス → 重み(0-10) */
interface Archetype {
  readonly name: string;
  readonly weights: readonly number[];
}

const NUM_TYPES = TYPES.length;

function w(base: number, overrides: Record<string, number>): readonly number[] {
  const arr = Array.from<number>({ length: NUM_TYPES }).fill(base);
  for (const [name, v] of Object.entries(overrides)) {
    arr[unitTypeIndex(name)] = v;
  }
  return arr;
}

const FALLBACK_ARCHETYPE: Archetype = { name: '混成型', weights: w(3, {}) };

const ARCHETYPES: readonly Archetype[] = [
  { name: 'スウォーム型', weights: w(1, { Drone: 10, Fighter: 6, Bomber: 2, Healer: 3 }) },
  { name: '重装型', weights: w(1, { Flagship: 8, Cruiser: 7, Bastion: 6, Carrier: 5, Bomber: 4 }) },
  { name: '奇襲型', weights: w(1, { Teleporter: 8, Lancer: 7, Sniper: 7, Disruptor: 5, Scrambler: 4 }) },
  { name: '支援型', weights: w(2, { Healer: 8, Amplifier: 7, Catalyst: 7, Bastion: 5, Fighter: 5, Cruiser: 4 }) },
  { name: '混成型', weights: w(3, {}) },
];

function pickArchetype(rng: () => number): Archetype {
  const idx = Math.floor(rng() * ARCHETYPES.length);
  return ARCHETYPES[idx] ?? FALLBACK_ARCHETYPE;
}

function costOf(i: number): number {
  return TYPES[i]?.cost ?? 1;
}

function weightOf(arch: Archetype, i: number): number {
  return arch.weights[i] ?? 0;
}

/** パス1: 重みに基づいてユニットを割り当て */
function allocateByWeight(
  arch: Archetype,
  budget: number,
  totalWeight: number,
  indices: number[],
  counts: number[],
  rng: () => number,
): number {
  const MIN_NOISE_TARGET = 3;
  let remaining = budget;
  for (const i of indices) {
    const cost = costOf(i);
    const weight = weightOf(arch, i);
    if (weight <= 0 || cost > remaining) {
      continue;
    }
    const share = (weight / totalWeight) * budget;
    const targetCount = Math.floor(share / cost);
    const noisy =
      targetCount >= MIN_NOISE_TARGET ? targetCount + Math.floor((rng() - 0.5) * targetCount * 0.4) : targetCount;
    const affordable = Math.min(Math.max(0, noisy), Math.floor(remaining / cost));
    counts[i] = affordable;
    remaining -= affordable * cost;
  }
  return remaining;
}

/** 端数: 重み降順で1体ずつ追加 */
function fillFraction(arch: Archetype, candidates: number[], counts: number[], remaining: number): number {
  let rem = remaining;
  const byWeight = candidates.slice().sort((a, b) => weightOf(arch, b) - weightOf(arch, a));
  for (const i of byWeight) {
    const cost = costOf(i);
    if (cost <= rem) {
      counts[i] = (counts[i] ?? 0) + 1;
      rem -= cost;
    }
    if (rem <= 0) {
      break;
    }
  }
  return rem;
}

/** パス2: 残り予算を重み比例で配分 */
function fillRemaining(arch: Archetype, indices: number[], counts: number[], remaining: number): number {
  let rem = remaining;
  const candidates = indices.filter((i) => costOf(i) <= rem && weightOf(arch, i) > 0);
  if (candidates.length === 0) {
    return rem;
  }

  const totalW = candidates.reduce((s, i) => s + weightOf(arch, i), 0);
  if (totalW <= 0) {
    return rem;
  }

  for (const i of candidates) {
    const cost = costOf(i);
    const share = (weightOf(arch, i) / totalW) * rem;
    const add = Math.floor(share / cost);
    if (add > 0) {
      counts[i] = (counts[i] ?? 0) + add;
      rem -= add * cost;
    }
  }

  if (rem > 0) {
    rem = fillFraction(arch, candidates, counts, rem);
  }
  return rem;
}

/** counts 配列を FleetComposition に変換 */
function collectFleet(counts: number[], budget: number): FleetEntry[] {
  const fleet: FleetEntry[] = [];
  for (let i = 0; i < NUM_TYPES; i++) {
    const c = counts[i];
    if (c !== undefined && c > 0) {
      fleet.push({ type: i, count: c });
    }
  }
  if (fleet.length === 0) {
    fleet.push({ type: 0, count: Math.max(1, Math.floor(budget / costOf(0))) });
  }
  return fleet;
}

/** Fisher-Yates (Durstenfeld) in-place shuffle */
function shuffle(arr: number[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a !== undefined && b !== undefined) {
      arr[i] = b;
      arr[j] = a;
    }
  }
}

/** 予算ベースの敵艦隊生成。rng は simulation/ 外から注入される */
export function generateEnemyFleet(
  budget: number,
  rng: () => number,
): { readonly fleet: FleetComposition; readonly archetypeName: string } {
  const arch = pickArchetype(rng);
  const totalWeight = arch.weights.reduce((s, v) => s + v, 0);
  const counts = new Array<number>(NUM_TYPES).fill(0);
  const indices = TYPES.map((_, i) => i);
  shuffle(indices, rng);

  const remaining = allocateByWeight(arch, budget, totalWeight, indices, counts, rng);
  if (remaining > 0) {
    fillRemaining(arch, indices, counts, remaining);
  }

  return { fleet: collectFleet(counts, budget), archetypeName: arch.name };
}
