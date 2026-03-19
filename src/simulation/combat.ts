import { effectColor } from '../colors.ts';
import { unitIdx } from '../pool-index.ts';
import { unit } from '../pools-query.ts';
import type { Armament, DemoFlag, Unit, UnitIndex, UnitType } from '../types.ts';
import { DEFAULT_UNIT_TYPE, unitType } from '../unit-type-accessors.ts';
import type { CombatContext, ShakeFn } from './combat-context.ts';
import { fireNormal } from './combat-fire.ts';
import { flagshipBarrage } from './combat-flagship.ts';
import { focusBeam } from './combat-focus-beam.ts';
import { mothershipCombat } from './combat-mothership.ts';
import { reflectProjectiles } from './combat-reflect.ts';
import { castChain, dischargeEmp, healAllies, launchDrones, ramTarget } from './combat-special.ts';
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
import { teleport } from './combat-teleport.ts';
import { computeEffectiveRange } from './steering.ts';

// GC回避用の再利用シングルトン。combat() 呼び出し時に全フィールドを上書きする。
// シングルスレッド前提: ワーカー分離時は per-call 割り当てに変更が必要
const _ctx: CombatContext = {
  u: unit(unitIdx(0)),
  ui: unitIdx(0),
  dt: 0,
  c: [0, 0, 0],
  vd: 0,
  t: unitType(DEFAULT_UNIT_TYPE),
  range: 0,
  rng: () => {
    throw new Error('CombatContext.rng called before combat() initialization');
  },
  shake: () => {
    throw new Error('CombatContext.shake called before combat() initialization');
  },
};

/** 支援系アビリティの分岐。排他的にreturnするものはtrue */
function dispatchSupportAbilities(ctx: CombatContext): boolean {
  const { t, u } = ctx;
  if (t.heals && u.abilityCooldown <= 0) {
    healAllies(ctx);
  }
  if (t.scrambles) {
    scrambleEnemies(ctx);
    return true;
  }
  if (t.reflects) {
    reflectProjectiles(ctx);
    return true;
  }
  if (t.shields) {
    shieldAllies(ctx);
  }
  if (t.amplifies) {
    amplifyAllies(ctx);
  }
  if (t.catalyzes) {
    catalyzeAllies(ctx);
  }
  if (t.spawns) {
    launchDrones(ctx);
  }
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

/** 共通の戦闘コンテキスト初期化。stun 時は false を返し、呼び出し元は即 return すべき。
 *  attackCdMul は通常射撃の cooldown のみに適用。abilityCooldown には適用しない（意図的仕様） */
function fillCombatCtx(
  u: Unit,
  ui: UnitIndex,
  dt: number,
  rng: () => number,
  attackCdMul: number,
  shake: ShakeFn,
): boolean {
  if (u.stun > 0) {
    return false;
  }
  const t = unitType(u.type);
  const scrCd = u.scrambleTimer > 0 ? SCRAMBLE_COOLDOWN_MULT : 1;
  const catCd = u.catalystTimer > 0 ? CATALYST_COOLDOWN_MULT : 1;
  u.cooldown -= dt * scrCd * catCd * attackCdMul;
  u.abilityCooldown -= dt * scrCd * catCd;
  const c = effectColor(u.type, u.team);
  const ampDmg = u.ampBoostTimer > 0 ? AMP_DAMAGE_MULT : 1;
  _ctx.u = u;
  _ctx.ui = ui;
  _ctx.dt = dt;
  _ctx.c = c;
  _ctx.vd = (1 + u.vet * 0.2) * ampDmg * u.mergeMul;
  _ctx.t = t;
  _ctx.range = computeEffectiveRange(u, t.attackRange);
  _ctx.rng = rng;
  _ctx.shake = shake;
  return true;
}

export function combat(u: Unit, ui: UnitIndex, dt: number, rng: () => number, attackCdMul: number, shake: ShakeFn) {
  if (!fillCombatCtx(u, ui, dt, rng, attackCdMul, shake)) {
    return;
  }

  if (_ctx.t.rams) {
    ramTarget(_ctx);
    return;
  }
  if (dispatchSupportAbilities(_ctx)) {
    return;
  }
  // teleport() が false を返すワープ待機中フレームでも、blinkDepart が設定した cooldown により射撃は抑制される
  const blinked = _ctx.t.teleports && teleport(_ctx);
  if (!blinked && !tryExclusiveFire(_ctx)) {
    fireNormal(_ctx);
  }
}

/**
 * 母艦専用の戦闘ティック。cooldown 減衰 + 搭載主砲射撃を処理する。
 * armament が null のバリアント（Hive/Reactor）では cooldown 減衰のみ実行。
 */
export function combatMothershipTick(
  u: Unit,
  ui: UnitIndex,
  dt: number,
  rng: () => number,
  attackCdMul: number,
  armament: Armament | null,
  shake: ShakeFn,
) {
  if (!fillCombatCtx(u, ui, dt, rng, attackCdMul, shake)) {
    return;
  }
  if (armament) {
    mothershipCombat(_ctx, armament);
  }
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
    if (t[flag]) {
      return flag;
    }
  }
  if (t.shots > 1) {
    return 'burst';
  }
  return null;
}
