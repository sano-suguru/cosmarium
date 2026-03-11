import { incMotherships, mothershipIdx, teamUnitCounts } from '../pools.ts';
import type { BattleTeam } from '../team.ts';
import type { UnitTypeIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import {
  AMPLIFIER_TYPE,
  ARCER_TYPE,
  BASTION_TYPE,
  BOMBER_TYPE,
  CARRIER_TYPE,
  CATALYST_TYPE,
  CRUISER_TYPE,
  DISRUPTOR_TYPE,
  DRONE_TYPE,
  FIGHTER_TYPE,
  FLAGSHIP_TYPE,
  HEALER_TYPE,
  LANCER_TYPE,
  LAUNCHER_TYPE,
  MOTHERSHIP_TYPE,
  REFLECTOR_TYPE,
  SCORCHER_TYPE,
  SCRAMBLER_TYPE,
  SNIPER_TYPE,
  TELEPORTER_TYPE,
} from '../unit-type-accessors.ts';
import { spawnUnit } from './spawn.ts';
import { battleOrigin, reinforcementOrigin } from './spawn-coordinates.ts';
import { assignToSquadron } from './squadron.ts';

// Reinforcement spawn probability distribution:
// Each wave spawns 8 Drones + 2 Fighters as baseline, then rolls r∈[0,1)
// for conditional spawns. Ranges overlap intentionally so multiple types
// can spawn in the same wave. Low-count gates (cnt<50/40) ensure rare
// powerful units appear only when the team is losing.
// Known overlaps are verified in reinforcements.test.ts

interface ReinforcementEntry {
  readonly type: UnitTypeIndex;
  readonly spread: number;
  readonly condition: (r: number, cnt: number) => boolean;
}

export const REINFORCEMENT_TABLE: readonly ReinforcementEntry[] = [
  { type: BOMBER_TYPE, spread: 80, condition: (r) => r < 0.5 },
  { type: CRUISER_TYPE, spread: 80, condition: (r) => r < 0.4 },
  { type: FLAGSHIP_TYPE, spread: 80, condition: (r, cnt) => cnt < 50 && r < 0.1 }, // losing
  { type: HEALER_TYPE, spread: 60, condition: (r) => r > 0.2 && r < 0.35 },
  { type: REFLECTOR_TYPE, spread: 60, condition: (r) => r > 0.35 && r < 0.5 },
  { type: CARRIER_TYPE, spread: 80, condition: (r, cnt) => cnt < 40 && r < 0.18 }, // losing
  { type: SNIPER_TYPE, spread: 80, condition: (r) => r > 0.5 && r < 0.65 },
  { type: LANCER_TYPE, spread: 50, condition: (r) => r > 0.65 && r < 0.77 },
  { type: LAUNCHER_TYPE, spread: 60, condition: (r) => r > 0.3 && r < 0.45 },
  { type: DISRUPTOR_TYPE, spread: 60, condition: (r) => r > 0.77 && r < 0.87 },
  { type: SCORCHER_TYPE, spread: 60, condition: (r) => r > 0.12 && r < 0.25 },
  { type: TELEPORTER_TYPE, spread: 60, condition: (r) => r > 0.87 && r < 0.95 },
  { type: ARCER_TYPE, spread: 60, condition: (r) => r > 0.95 },
  { type: BASTION_TYPE, spread: 60, condition: (r) => r > 0.45 && r < 0.55 }, // overlaps BOMBER
  { type: AMPLIFIER_TYPE, spread: 60, condition: (r) => r > 0.55 && r < 0.67 },
  { type: SCRAMBLER_TYPE, spread: 60, condition: (r) => r > 0.67 && r < 0.77 }, // overlaps LANCER
  { type: CATALYST_TYPE, spread: 60, condition: (r) => r > 0.87 && r < 0.97 },
  { type: DISRUPTOR_TYPE, spread: 60, condition: (r, cnt) => cnt < 35 && r < 0.6 }, // 劣勢時
  { type: BOMBER_TYPE, spread: 80, condition: (r, cnt) => cnt < 35 && r > 0.4 }, // 劣勢時
];

function spawnWave(team: BattleTeam, cnt: number, rng: () => number) {
  const [cx, cy] = reinforcementOrigin(team, rng);
  const r = rng();
  const s = (tp: UnitTypeIndex, spread: number) => {
    const idx = spawnUnit(team, tp, cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, rng);
    if (idx !== NO_UNIT) {
      assignToSquadron(idx, team);
    }
  };
  for (let i = 0; i < 8; i++) {
    s(DRONE_TYPE, 100);
  }
  for (let i = 0; i < 2; i++) {
    s(FIGHTER_TYPE, 80);
  }
  for (let i = 0; i < REINFORCEMENT_TABLE.length; i++) {
    const entry = REINFORCEMENT_TABLE[i];
    if (entry?.condition(r, cnt)) {
      s(entry.type, entry.spread);
    }
  }
}

export interface ReinforcementState {
  reinforcementTimer: number;
}

export const REINFORCE_INTERVAL = 2.5;
export const REINFORCE_UNIT_CAP = 250;
/**
 * ユニット数比率 (myCnt/enemyCnt) の閾値。
 * - ratio >= 1.3 → 優勢側の増援スキップ（30%以上多い＝十分優勢）
 * - ratio <= 1/1.3 ≈ 0.77 → 劣勢側にボーナス2ウェーブ（23%以上少ない＝苦戦中）
 * - 中間 → 通常1ウェーブ
 */
export const RUBBER_BAND_RATIO = 1.3;

/** spectate 専用の増援スポーン。battle/melee では stepOnce の switch で呼ばれない */
export function reinforce(dt: number, rng: () => number, rs: ReinforcementState) {
  rs.reinforcementTimer += dt;
  if (rs.reinforcementTimer < REINFORCE_INTERVAL) {
    return;
  }
  rs.reinforcementTimer = 0;

  // spectate 専用: 撃沈された母艦を reinforce サイクルで復活
  // プール満杯時は復活できないが、spectate には勝敗判定がないため影響なし
  for (const team of [0, 1] as const) {
    if (mothershipIdx[team] === NO_UNIT) {
      const [cx, cy] = battleOrigin(team);
      const idx = spawnUnit(team, MOTHERSHIP_TYPE, cx, cy, rng);
      if (idx !== NO_UNIT) {
        incMotherships(team, idx);
      }
    }
  }

  reinforceWaves(rng);
}

function reinforceWaves(rng: () => number) {
  const lim = REINFORCE_UNIT_CAP;
  const bonusThreshold = 1 / RUBBER_BAND_RATIO;
  // ループ前にスナップショット — team0のスポーンがteam1の比率計算に影響しないようにする
  const snapped = [teamUnitCounts[0], teamUnitCounts[1]] as const;
  for (const team of [0, 1] as const) {
    const myCnt = snapped[team];
    if (myCnt >= lim) {
      continue;
    }

    const enemyCnt = snapped[team === 0 ? 1 : 0];
    const ratio = enemyCnt > 0 ? myCnt / enemyCnt : 1.0;

    if (ratio >= RUBBER_BAND_RATIO) {
      continue;
    }

    spawnWave(team, snapped[team], rng);

    if (ratio <= bonusThreshold) {
      spawnWave(team, snapped[team], rng);
    }
  }
}
