import { incMotherships, mothershipIdx, teamUnitCounts } from '../pools.ts';
import type { BattleTeam, UnitTypeIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { DRONE_TYPE, unitTypeIndex } from '../unit-types.ts';
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

const FIGHTER = unitTypeIndex('Fighter');
const BOMBER = unitTypeIndex('Bomber');
const CRUISER = unitTypeIndex('Cruiser');
const FLAGSHIP = unitTypeIndex('Flagship');
const HEALER = unitTypeIndex('Healer');
const REFLECTOR = unitTypeIndex('Reflector');
const CARRIER = unitTypeIndex('Carrier');
const SNIPER = unitTypeIndex('Sniper');
const LANCER = unitTypeIndex('Lancer');
const LAUNCHER = unitTypeIndex('Launcher');
const DISRUPTOR = unitTypeIndex('Disruptor');
const SCORCHER = unitTypeIndex('Scorcher');
const TELEPORTER = unitTypeIndex('Teleporter');
const ARCER = unitTypeIndex('Arcer');
const BASTION = unitTypeIndex('Bastion');
const AMPLIFIER = unitTypeIndex('Amplifier');
const SCRAMBLER = unitTypeIndex('Scrambler');
const CATALYST = unitTypeIndex('Catalyst');

export const REINFORCEMENT_TABLE: readonly ReinforcementEntry[] = [
  { type: BOMBER, spread: 80, condition: (r) => r < 0.5 }, // 50%
  { type: CRUISER, spread: 80, condition: (r) => r < 0.4 }, // 40%
  { type: FLAGSHIP, spread: 80, condition: (r, cnt) => cnt < 50 && r < 0.1 }, // 10% (losing)
  { type: HEALER, spread: 60, condition: (r) => r > 0.2 && r < 0.35 }, // 15%
  { type: REFLECTOR, spread: 60, condition: (r) => r > 0.35 && r < 0.5 }, // 15%
  { type: CARRIER, spread: 80, condition: (r, cnt) => cnt < 40 && r < 0.18 }, // 18% (losing)
  { type: SNIPER, spread: 80, condition: (r) => r > 0.5 && r < 0.65 }, // 15%
  { type: LANCER, spread: 50, condition: (r) => r > 0.65 && r < 0.77 }, // 12%
  { type: LAUNCHER, spread: 60, condition: (r) => r > 0.3 && r < 0.45 }, // 15%
  { type: DISRUPTOR, spread: 60, condition: (r) => r > 0.77 && r < 0.87 }, // 10%
  { type: SCORCHER, spread: 60, condition: (r) => r > 0.12 && r < 0.25 }, // 13%
  { type: TELEPORTER, spread: 60, condition: (r) => r > 0.87 && r < 0.95 }, // 8%
  { type: ARCER, spread: 60, condition: (r) => r > 0.95 }, // 5%
  { type: BASTION, spread: 60, condition: (r) => r > 0.45 && r < 0.55 }, // 10% (overlaps BOMBER)
  { type: AMPLIFIER, spread: 60, condition: (r) => r > 0.55 && r < 0.67 }, // 12%
  { type: SCRAMBLER, spread: 60, condition: (r) => r > 0.67 && r < 0.77 }, // 10% (overlaps LANCER)
  { type: CATALYST, spread: 60, condition: (r) => r > 0.87 && r < 0.97 }, // 10%
  { type: DISRUPTOR, spread: 60, condition: (r, cnt) => cnt < 35 && r < 0.6 }, // 劣勢時60%
  { type: BOMBER, spread: 80, condition: (r, cnt) => cnt < 35 && r > 0.4 }, // 劣勢時60%
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
    s(FIGHTER, 80);
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

const MOTHERSHIP_TYPE = unitTypeIndex('Mothership');

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
