import { BLINK_KILL_CD } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Team, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';

export const KILL_CONTEXT = {
  ProjectileDirect: 0,
  ProjectileAoe: 1,
  Beam: 2,
  Ram: 3,
  ChainLightning: 4,
  SweepBeam: 5,
} as const;

type KillContext = (typeof KILL_CONTEXT)[keyof typeof KILL_CONTEXT];

function shouldApplyCooldownReset(ctx: KillContext): boolean {
  switch (ctx) {
    case KILL_CONTEXT.ProjectileDirect:
      return true;
    case KILL_CONTEXT.ProjectileAoe:
    case KILL_CONTEXT.Beam:
    case KILL_CONTEXT.Ram:
    case KILL_CONTEXT.ChainLightning:
    case KILL_CONTEXT.SweepBeam:
      return false;
    default: {
      const _exhaustive: never = ctx;
      return _exhaustive;
    }
  }
}

export function applyOnKillEffects(sourceUnit: UnitIndex, sourceTeam: Team, ctx: KillContext): void {
  if (!shouldApplyCooldownReset(ctx)) return;
  if (sourceUnit === NO_UNIT) return;
  const shooter = unit(sourceUnit);
  if (!shooter.alive || shooter.team !== sourceTeam) return;
  const st = unitType(shooter.type);
  if (st.cooldownResetOnKill !== undefined) {
    shooter.cooldown = Math.min(shooter.cooldown, st.cooldownResetOnKill);
  }
  if (st.teleports && shooter.blinkCount === 0) {
    shooter.teleportTimer = Math.max(0, shooter.teleportTimer - BLINK_KILL_CD);
  }
}
