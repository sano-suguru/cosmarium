import { MOTHERSHIP_DEFS } from '../mothership-defs.ts';
import type { ShopSlot } from '../shop-tiers.ts';
import { COST_LOW_MAX, COST_MID_MAX } from '../shop-tiers.ts';
import type { UnitRole, UnitTypeIndex } from '../types.ts';
import { BASTION_TYPE, REFLECTOR_TYPE, unitTypeCost } from '../unit-type-accessors.ts';
import { TYPES } from '../unit-types.ts';
import { weightedPick } from '../weighted-pick.ts';

type RoleCounts = { attack: number; support: number; special: number };
type ProfiledRole = 'attack' | 'support' | 'special';

function isProfiledRole(r: UnitRole): r is ProfiledRole {
  return r === 'attack' || r === 'support' || r === 'special';
}

const DEFENSIVE_TYPES = new Set([REFLECTOR_TYPE, BASTION_TYPE]);

export type FleetProfile = {
  roles: RoleCounts;
  total: number;
  hasHigh: boolean;
  allLow: boolean;
  hasDefensive: boolean;
};

export function profileFleet(slots: readonly (ShopSlot | null)[]): FleetProfile {
  const roles: RoleCounts = { attack: 0, support: 0, special: 0 };
  let total = 0;
  let hasHigh = false;
  let allLow = true;
  let hasDefensive = false;

  for (const s of slots) {
    if (!s) {
      continue;
    }
    total++;
    const t = TYPES[s.type];
    if (!t) {
      continue;
    }
    if (isProfiledRole(t.role)) {
      roles[t.role]++;
    }
    const cost = unitTypeCost(s.type);
    hasHigh = hasHigh || cost > COST_MID_MAX;
    allLow = allLow && cost <= COST_LOW_MAX;
    hasDefensive = hasDefensive || DEFENSIVE_TYPES.has(s.type);
  }

  return { roles, total, hasHigh, allLow, hasDefensive };
}

// 母艦タイプ選択

/**
 * ラウンド依存の母艦選択。序盤は Hive（生産力）重め、中盤以降は均等化。
 * profileFleet とは独立 — 母艦→予算→艦隊の順序制約のため、母艦をプロファイルより先に確定する。
 * MOTHERSHIP_DEFS の botWeights からフェーズ別重みを取得するデータ駆動方式。
 */
export function pickMothershipTypeByRound(rng: () => number, round: number): UnitTypeIndex {
  let phase: number;
  if (round <= 4) {
    phase = 0;
  } else if (round <= 8) {
    phase = 1;
  } else {
    phase = 2;
  }
  const candidates: { weight: number; type: UnitTypeIndex }[] = [];
  for (const def of MOTHERSHIP_DEFS) {
    const w = def.botWeights[phase] ?? 0;
    if (w > 0) {
      candidates.push({ weight: w, type: def.type });
    }
  }
  if (candidates.length === 0) {
    throw new Error('pickMothershipTypeByRound: no candidates with positive weight');
  }
  const picked = weightedPick(candidates, rng);
  const entry = candidates[picked];
  if (!entry) {
    throw new Error('pickMothershipTypeByRound: weightedPick returned invalid index');
  }
  return entry.type;
}

// アーキタイプ名導出

export function deriveArchetypeFromProfile(profile: FleetProfile): string {
  const { roles, total, hasHigh, allLow, hasDefensive } = profile;
  if (total === 0) {
    return '混成型';
  }
  if (roles.attack / total >= 0.6) {
    return '攻撃型';
  }
  if (roles.support >= 2 && hasDefensive && roles.attack / total < 0.5) {
    return '防壁型';
  }
  if (roles.support / total >= 0.4) {
    return '支援型';
  }
  if (roles.special / total >= 0.4) {
    return '奇襲型';
  }
  if (allLow) {
    return 'スウォーム型';
  }
  if (hasHigh) {
    return '重装型';
  }
  return '混成型';
}
