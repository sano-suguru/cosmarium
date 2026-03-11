import { unit } from '../pools-query.ts';
import type { Team } from '../team.ts';
import type { UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import type { DamageKind } from './hooks.ts';

const BLINK_KILL_CD = 0.8;

export const KILL_CONTEXT = {
  ProjectileDirect: 0,
  ProjectileAoe: 1,
  Beam: 2,
  Ram: 3,
  ChainLightning: 4,
  SweepBeam: 5,
  Emp: 6,
  Reflect: 7,
  Tether: 8,
} as const;

export type KillContext = (typeof KILL_CONTEXT)[keyof typeof KILL_CONTEXT];

export const KILL_CONTEXT_COUNT = Object.keys(KILL_CONTEXT).length;

export const DAMAGE_KIND_TO_KILL_CONTEXT: Record<DamageKind, KillContext> = {
  direct: KILL_CONTEXT.ProjectileDirect,
  aoe: KILL_CONTEXT.ProjectileAoe,
  beam: KILL_CONTEXT.Beam,
  emp: KILL_CONTEXT.Emp,
  reflect: KILL_CONTEXT.Reflect,
  tether: KILL_CONTEXT.Tether,
  ram: KILL_CONTEXT.Ram,
  chain: KILL_CONTEXT.ChainLightning,
  sweep: KILL_CONTEXT.SweepBeam,
};

/** 各 KillContext に対応する日本語ラベル。キーの過不足はコンパイルエラーで検出される */
const KILL_CONTEXT_LABELS: { readonly [K in keyof typeof KILL_CONTEXT]: string } = {
  ProjectileDirect: '直撃',
  ProjectileAoe: 'AoE',
  Beam: 'ビーム',
  Ram: 'ラム',
  ChainLightning: 'チェイン',
  SweepBeam: '掃射',
  Emp: 'EMP',
  Reflect: '反射',
  Tether: 'テザー',
};

/** KillContext の数値順（0, 1, 2, …）に並んだラベル配列 */
export const KILL_CONTEXT_LABEL_LIST: readonly string[] = (
  Object.entries(KILL_CONTEXT) as [keyof typeof KILL_CONTEXT, number][]
)
  .sort(([, a], [, b]) => a - b)
  .map(([key]) => KILL_CONTEXT_LABELS[key]);

function shouldApplyCooldownReset(ctx: KillContext): boolean {
  switch (ctx) {
    case KILL_CONTEXT.ProjectileDirect:
      return true;
    case KILL_CONTEXT.ProjectileAoe:
    case KILL_CONTEXT.Beam:
    case KILL_CONTEXT.Ram:
    case KILL_CONTEXT.ChainLightning:
    case KILL_CONTEXT.SweepBeam:
    case KILL_CONTEXT.Emp:
    case KILL_CONTEXT.Reflect:
    case KILL_CONTEXT.Tether:
      return false;
    default: {
      const _exhaustive: never = ctx;
      return _exhaustive;
    }
  }
}

export function applyOnKillEffects(sourceUnit: UnitIndex, sourceTeam: Team, ctx: KillContext): void {
  if (!shouldApplyCooldownReset(ctx)) {
    return;
  }
  if (sourceUnit === NO_UNIT) {
    return;
  }
  const shooter = unit(sourceUnit);
  if (!shooter.alive || shooter.team !== sourceTeam) {
    return;
  }
  const st = unitType(shooter.type);
  if (st.cooldownResetOnKill !== undefined) {
    shooter.cooldown = Math.min(shooter.cooldown, st.cooldownResetOnKill);
  }
  if (st.teleports && shooter.blinkCount === 0) {
    shooter.teleportTimer = Math.max(0, shooter.teleportTimer - BLINK_KILL_CD);
  }
}
