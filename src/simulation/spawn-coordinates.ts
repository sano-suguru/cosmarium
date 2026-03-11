import { TAU, WORLD_SIZE } from '../constants.ts';
import type { BattleTeam, Team } from '../team.ts';

const BATTLE_SPAWN_X = 1200;
const BATTLE_SPAWN_Y = 300;

/** バトルモード（2チーム）のチーム初期位置。team 0 = 左, team 1 = 右 */
export function battleOrigin(team: BattleTeam): [number, number] {
  const sign = team === 0 ? -1 : 1;
  return [sign * BATTLE_SPAWN_X, sign * BATTLE_SPAWN_Y];
}

const MELEE_SPAWN_RADIUS = 1200;

/** Meleeモード（N勢力）の円周配置原点 */
export function meleeOrigin(team: Team, numTeams: number): [number, number] {
  const angle = (team / numTeams) * TAU;
  return [Math.cos(angle) * MELEE_SPAWN_RADIUS, Math.sin(angle) * MELEE_SPAWN_RADIUS];
}

/** 増援ウェーブのスポーン座標。ワールド端付近から出現する */
export function reinforcementOrigin(team: BattleTeam, rng: () => number): [number, number] {
  const cx = team === 0 ? -WORLD_SIZE * 0.6 : WORLD_SIZE * 0.6;
  const cy = (rng() - 0.5) * WORLD_SIZE;
  return [cx, cy];
}
