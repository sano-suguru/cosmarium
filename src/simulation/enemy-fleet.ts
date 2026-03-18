import { getMothershipDef } from '../mothership-defs.ts';
import { createProductionSlot, filledSlots, SLOT_COUNT } from '../production-config.ts';
import type { ShopSlot } from '../shop-tiers.ts';
import { ROUND_CREDITS, slotsToProduction } from '../shop-tiers.ts';
import type { FleetSetup } from '../types-fleet.ts';
import { DRONE_TYPE, FIGHTER_TYPE, HIVE_TYPE } from '../unit-type-accessors.ts';
import { TYPES } from '../unit-types.ts';
import { botFillSlots } from './enemy-fleet-bot.ts';
import { deriveArchetypeFromProfile, pickMothershipTypeByRound, profileFleet } from './enemy-fleet-profile.ts';

// 固定NPC

function generateFixedNpc(round: number): {
  readonly setup: FleetSetup;
  readonly archetypeName: string;
  readonly botSlots: readonly (ShopSlot | null)[] | null;
} {
  const mothershipType = HIVE_TYPE;
  const slots: (ReturnType<typeof createProductionSlot> | null)[] = Array.from<null, null>(
    { length: SLOT_COUNT },
    () => null,
  );

  if (round === 1) {
    slots[0] = createProductionSlot(DRONE_TYPE, 3);
    // 固定NPCはショップBot経由でないため ShopSlot を持たない
    return { setup: { mothershipType, slots }, archetypeName: '偵察隊', botSlots: null };
  }
  if (round === 2) {
    slots[0] = createProductionSlot(DRONE_TYPE, 3);
    slots[1] = createProductionSlot(FIGHTER_TYPE, 2);
    // 固定NPCはショップBot経由でないため ShopSlot を持たない
    return { setup: { mothershipType, slots }, archetypeName: '前衛部隊', botSlots: null };
  }
  throw new Error(`generateFixedNpc: unexpected round ${round}`);
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
  // Phase 1a: 序盤固定NPC（ラウンド1-2）
  if (round <= 2) {
    return generateFixedNpc(round);
  }

  // 母艦先行決定 → creditsPerRound を予算に反映（プレイヤーとの対称性）
  const mothershipType = pickMothershipTypeByRound(rng, round);
  const msCredits = getMothershipDef(mothershipType).creditsPerRound;
  const botSlots = botFillSlots(rng, round, ROUND_CREDITS + msCredits);
  const profile = profileFleet(botSlots);

  const productionSlots = slotsToProduction(botSlots, getMothershipDef(mothershipType).spawnCountMul);
  // 全 null フォールバック: 最低1つの non-null スロットを保証
  if (filledSlots(productionSlots).length === 0) {
    productionSlots[0] = createProductionSlot(DRONE_TYPE, TYPES[DRONE_TYPE]?.clusterSize ?? 1);
  }

  return {
    setup: { mothershipType, slots: productionSlots },
    archetypeName: deriveArchetypeFromProfile(profile),
    botSlots,
  };
}
