import { effectColor } from '../colors.ts';
import { unit } from '../pools.ts';
import type { DemoFlag, Unit, UnitIndex, UnitType } from '../types.ts';
import { unitType } from '../unit-types.ts';
import type { CombatContext } from './combat-context.ts';
import { fireNormal } from './combat-fire.ts';
import { flagshipBarrage } from './combat-flagship.ts';
import { focusBeam } from './combat-focus-beam.ts';
import { reflectProjectiles } from './combat-reflect.ts';
import { castChain, dischargeEmp, healAllies, launchDrones, ramTarget, teleport } from './combat-special.ts';
import {
  AMP_DAMAGE_MULT,
  amplifyAllies,
  CATALYST_COOLDOWN_MULT,
  catalyzeAllies,
  SCRAMBLE_COOLDOWN_MULT,
  scrambleEnemies,
  shieldAllies,
} from './combat-support.ts';
import { sweepBeam } from './combat-sweep.ts';
import { computeEffectiveRange } from './steering.ts';

// GC回避用の再利用シングルトン。combat() 呼び出し時に全フィールドを上書きする。
// シングルスレッド前提: ワーカー分離時は per-call 割り当てに変更が必要
const _ctx: CombatContext = {
  u: unit(0 as UnitIndex),
  ui: 0 as UnitIndex,
  dt: 0,
  c: [0, 0, 0],
  vd: 0,
  t: unitType(0),
  range: 0,
  rng: () => {
    throw new Error('CombatContext.rng called before combat() initialization');
  },
};

/** 支援系アビリティの分岐。排他的にreturnするものはtrue */
function dispatchSupportAbilities(ctx: CombatContext): boolean {
  const { t, u } = ctx;
  if (t.heals && u.abilityCooldown <= 0) healAllies(ctx);
  if (t.scrambles) {
    scrambleEnemies(ctx);
    return true;
  }
  if (t.reflects) {
    reflectProjectiles(ctx);
    return true;
  }
  if (t.shields) shieldAllies(ctx);
  if (t.amplifies) amplifyAllies(ctx);
  if (t.catalyzes) catalyzeAllies(ctx);
  if (t.spawns) launchDrones(ctx);
  if (t.emp && u.abilityCooldown <= 0) {
    dischargeEmp(ctx);
    return true;
  }
  return false;
}

/** @returns true if an exclusive ability fired */
function tryExclusiveFire(ctx: CombatContext): boolean {
  const { t, u } = ctx;
  if (t.chain && u.cooldown <= 0) {
    castChain(ctx);
    return true;
  }
  if (t.sweep) {
    sweepBeam(ctx);
    return true;
  }
  if (t.broadside) {
    flagshipBarrage(ctx);
    return true;
  }
  if (t.beam) {
    focusBeam(ctx);
    return true;
  }
  return false;
}

export function combat(u: Unit, ui: UnitIndex, dt: number, _now: number, rng: () => number) {
  const t = unitType(u.type);
  if (u.stun > 0) return;
  const scrCd = u.scrambleTimer > 0 ? SCRAMBLE_COOLDOWN_MULT : 1;
  const catCd = u.catalystTimer > 0 ? CATALYST_COOLDOWN_MULT : 1;
  u.cooldown -= dt * scrCd * catCd;
  u.abilityCooldown -= dt * scrCd * catCd;
  const c = effectColor(u.type, u.team);
  const ampDmg = u.ampBoostTimer > 0 ? AMP_DAMAGE_MULT : 1;
  const vd = (1 + u.vet * 0.2) * ampDmg;
  _ctx.u = u;
  _ctx.ui = ui;
  _ctx.dt = dt;
  _ctx.c = c;
  _ctx.vd = vd;
  _ctx.t = t;
  _ctx.range = computeEffectiveRange(u, t.range);
  _ctx.rng = rng;

  if (t.rams) {
    ramTarget(_ctx);
    return;
  }
  if (dispatchSupportAbilities(_ctx)) return;
  // teleport() が false を返すワープ待機中フレームでも、blinkDepart が設定した cooldown により射撃は抑制される
  const blinked = t.teleports && teleport(_ctx);
  if (!blinked && !tryExclusiveFire(_ctx)) fireNormal(_ctx);
}

const COMBAT_FLAG_PRIORITY: Exclude<DemoFlag, 'burst'>[] = [
  'rams',
  'heals',
  'scrambles',
  'reflects',
  'shields',
  'amplifies',
  'catalyzes',
  'spawns',
  'emp',
  'teleports',
  'chain',
  'sweep',
  'broadside',
  'beam',
  'carpet',
  'homing',
  'swarm',
];

export function demoFlag(t: UnitType): DemoFlag | null {
  for (const flag of COMBAT_FLAG_PRIORITY) {
    if (t[flag]) return flag;
  }
  if (t.shots > 1) return 'burst';
  return null;
}
