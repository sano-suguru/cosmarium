import type { UnitType } from './types.ts';

/** 射撃を行わないユニット用のダミー fireRate（cooldown が実質満了しない大きな値） */
export const NO_FIRE = 999;

/** resolve() が自動補完する UnitType のデフォルト値プロパティ群 */
type DefaultKeys =
  | 'aoe'
  | 'carpet'
  | 'beam'
  | 'heals'
  | 'reflects'
  | 'spawns'
  | 'homing'
  | 'rams'
  | 'emp'
  | 'teleports'
  | 'chain'
  | 'sweep'
  | 'swarm'
  | 'broadside'
  | 'shots'
  | 'salvo'
  | 'massWeight'
  | 'shields'
  | 'amplifies'
  | 'scrambles'
  | 'catalyzes'
  | 'supportFollow'
  | 'maxEnergy'
  | 'energyRegen'
  | 'shieldCooldown';

const DEFAULTS: Pick<UnitType, DefaultKeys> = {
  aoe: 0,
  carpet: false,
  beam: false,
  heals: false,
  reflects: false,
  spawns: false,
  homing: false,
  rams: false,
  emp: false,
  teleports: false,
  chain: false,
  sweep: false,
  swarm: false,
  broadside: false,
  shots: 1,
  salvo: 0,
  massWeight: 0,
  shields: false,
  amplifies: false,
  scrambles: false,
  catalyzes: false,
  supportFollow: 0,
  maxEnergy: 0,
  energyRegen: 0,
  shieldCooldown: 0,
};

export function resolve(partial: Omit<UnitType, DefaultKeys> & Partial<Pick<UnitType, DefaultKeys>>): UnitType {
  return { ...DEFAULTS, ...partial };
}
