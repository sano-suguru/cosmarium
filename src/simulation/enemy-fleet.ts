import { getMothershipDef } from '../mothership-defs.ts';
import { createProductionSlot, DEFAULT_SLOT_COUNT, filledSlots } from '../production-config.ts';
import { bossBudgetMul } from '../round-schedule.ts';
import type { ShopSlot } from '../shop-tiers.ts';
import { ROUND_CREDITS, slotsToProduction } from '../shop-tiers.ts';
import type { UnitTypeIndex } from '../types.ts';
import type { FleetSetup, ProductionSlot } from '../types-fleet.ts';
import { COLOSSUS_TYPE, DRONE_TYPE, FIGHTER_TYPE, HIVE_TYPE, unitType } from '../unit-type-accessors.ts';
import { botFillSlots } from './enemy-fleet-bot.ts';
import type { FleetProfile } from './enemy-fleet-profile.ts';
import { deriveArchetypeFromProfile, pickMothershipTypeByRound, profileFleet } from './enemy-fleet-profile.ts';

// 固定NPC

function generateFixedNpc(round: number): {
  readonly setup: FleetSetup;
  readonly archetypeName: string;
  readonly botSlots: readonly (ShopSlot | null)[] | null;
} {
  const mothershipType = HIVE_TYPE;
  const slots: (ReturnType<typeof createProductionSlot> | null)[] = Array.from<null, null>(
    { length: DEFAULT_SLOT_COUNT },
    () => null,
  );

  if (round === 1) {
    slots[0] = createProductionSlot(DRONE_TYPE, 3, 0);
    // 固定NPCはショップBot経由でないため ShopSlot を持たない
    return { setup: { mothershipType, slots }, archetypeName: '偵察隊', botSlots: null };
  }
  if (round === 2) {
    slots[0] = createProductionSlot(DRONE_TYPE, 3, 0);
    slots[1] = createProductionSlot(FIGHTER_TYPE, 2, 0);
    // 固定NPCはショップBot経由でないため ShopSlot を持たない
    return { setup: { mothershipType, slots }, archetypeName: '前衛部隊', botSlots: null };
  }
  throw new Error(`generateFixedNpc: unexpected round ${round}`);
}

// 共通艦隊構築

function buildFleet(
  rng: () => number,
  round: number,
  msType: UnitTypeIndex,
  budget: number,
): {
  productionSlots: (ProductionSlot | null)[];
  botSlots: readonly (ShopSlot | null)[];
  profile: FleetProfile;
} {
  const def = getMothershipDef(msType);
  const botSlots = botFillSlots(rng, round, budget, def.slotCount);
  const profile = profileFleet(botSlots);
  const productionSlots = slotsToProduction(botSlots, def.spawnCountMul);
  if (filledSlots(productionSlots).length === 0) {
    productionSlots[0] = createProductionSlot(DRONE_TYPE, unitType(DRONE_TYPE).clusterSize, 0);
  }
  return { productionSlots, botSlots, profile };
}

// Public API

/**
 * battle 用 — ショップ制約準拠の敵艦隊生成（プロシージャルBot）。
 * プレイヤーと同じクレジット予算・ティア出現率・マージ制約に従う。
 */
export function generateEnemySetup(
  rng: () => number,
  round: number,
): {
  readonly setup: FleetSetup;
  readonly archetypeName: string;
  readonly botSlots: readonly (ShopSlot | null)[] | null;
} {
  if (round <= 2) {
    return generateFixedNpc(round);
  }

  const mothershipType = pickMothershipTypeByRound(rng, round);
  const def = getMothershipDef(mothershipType);
  const { productionSlots, botSlots, profile } = buildFleet(
    rng,
    round,
    mothershipType,
    ROUND_CREDITS + def.creditsPerRound,
  );

  return {
    setup: { mothershipType, slots: productionSlots },
    archetypeName: deriveArchetypeFromProfile(profile),
    botSlots,
  };
}

/** ボスラウンド用 — 通常敵生成ベースで母艦を Colossus に固定し、追加予算で強化 */
export function generateBossSetup(
  rng: () => number,
  round: number,
): { readonly setup: FleetSetup; readonly archetypeName: string } {
  const mothershipType = COLOSSUS_TYPE;
  const def = getMothershipDef(mothershipType);
  const budget = Math.floor((ROUND_CREDITS + def.creditsPerRound) * bossBudgetMul(round));
  const { productionSlots } = buildFleet(rng, round, mothershipType, budget);

  return {
    setup: { mothershipType, slots: productionSlots },
    archetypeName: 'BOSS: 超弩級艦隊',
  };
}
