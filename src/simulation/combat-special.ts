import { SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { DRONE_TYPE, unitType } from '../unit-type-accessors.ts';
import { chainLightning } from './chain-lightning.ts';
import { tgtDistOrClear } from './combat-aim.ts';
import type { CombatContext } from './combat-context.ts';
import { destroyMutualKill, destroyUnit } from './effects.ts';
import { emitDamage, emitSupport } from './hooks.ts';
import { DAMAGE_KIND_TO_KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighbors, knockback } from './spatial-hash.ts';
import { captureKiller, spawnParticle, spawnUnit } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';

export const HEALER_AMOUNT = 3;
export const HEALER_COOLDOWN = 0.35;

function ramCollisionSparks(x: number, y: number, rng: () => number) {
  for (let k = 0; k < 10; k++) {
    const a = rng() * 6.283;
    spawnParticle(
      x,
      y,
      Math.cos(a) * (80 + rng() * 160),
      Math.sin(a) * (80 + rng() * 160),
      0.15,
      2 + rng() * 2,
      1,
      0.9,
      0.4,
      SH_CIRCLE,
    );
  }
}

function applyRamDamage(ctx: CombatContext, oi: UnitIndex, o: Unit, oType: UnitType) {
  const { u, ui, vd } = ctx;
  const kind = 'ram';
  const hasField = o.reflectFieldHp > 0;
  const fieldMul = hasField ? 0.5 : 1;
  const ramDmg = Math.ceil(u.mass * 2.5 * vd * fieldMul);
  o.hp -= ramDmg;
  emitDamage(u.type, u.team, o.type, o.team, ramDmg, kind);
  if (hasField) {
    o.reflectFieldHp = Math.max(0, o.reflectFieldHp - ramDmg);
  }
  o.hitFlash = 1;
  knockback(oi, u.x, u.y, u.mass * 55);
  const selfDmg = Math.ceil(oType.mass * 2 * (hasField ? 1.5 : 1));
  u.hp -= selfDmg;
  emitDamage(o.type, o.team, u.type, u.team, selfDmg, kind);
  ramCollisionSparks((u.x + o.x) / 2, (u.y + o.y) / 2, ctx.rng);
  const killCtx = DAMAGE_KIND_TO_KILL_CONTEXT[kind];
  if (o.hp <= 0 && u.hp <= 0) {
    destroyMutualKill(ui, oi, true, true, ctx.rng, killCtx, ctx.shake);
    return true;
  }
  if (o.hp <= 0) {
    destroyUnit(oi, ui, ctx.rng, killCtx, ctx.shake);
  } else if (u.hp <= 0) {
    destroyUnit(ui, oi, ctx.rng, killCtx, ctx.shake);
    return true;
  }
  return false;
}

export function ramTarget(ctx: CombatContext) {
  const { u, t } = ctx;
  const nb = getNeighbors(u.x, u.y, t.size * 2);
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i),
      o = unit(oi);
    if (!o.alive || o.team === u.team) {
      continue;
    }
    const oType = unitType(o.type);
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= t.size + oType.size) {
      continue;
    }
    if (applyRamDamage(ctx, oi, o, oType)) {
      return;
    }
  }
}

export function healAllies(ctx: CombatContext) {
  const { u, ui } = ctx;
  u.abilityCooldown = HEALER_COOLDOWN;
  const nb = getNeighbors(u.x, u.y, 160);
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i),
      o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === ui) {
      continue;
    }
    if (o.hp < o.maxHp) {
      const healAmount = Math.min(HEALER_AMOUNT, o.maxHp - o.hp);
      o.hp = Math.min(o.maxHp, o.hp + HEALER_AMOUNT);
      addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
      emitSupport(u.type, u.team, o.type, o.team, 'heal', healAmount);
    }
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, SH_EXPLOSION_RING);
}

export function launchDrones(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;
  u.spawnCooldown -= dt;
  if (u.spawnCooldown <= 0) {
    u.spawnCooldown = 3 + ctx.rng() * 2;
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * 6.283;
      spawnUnit(u.team, DRONE_TYPE, u.x + Math.cos(a) * t.size * 2, u.y + Math.sin(a) * t.size * 2, ctx.rng);
    }
    for (let i = 0; i < 10; i++) {
      const a = ctx.rng() * 6.283;
      spawnParticle(
        u.x + Math.cos(a) * t.size,
        u.y + Math.sin(a) * t.size,
        (ctx.rng() - 0.5) * 50,
        (ctx.rng() - 0.5) * 50,
        0.3,
        3,
        c[0],
        c[1],
        c[2],
        SH_CIRCLE,
      );
    }
  }
}

function applyEmpDamage(ctx: CombatContext, oi: UnitIndex, oo: Unit) {
  const { u, t } = ctx;
  const empKind = 'emp';
  oo.stun = 1.5;
  oo.hp -= t.damage;
  oo.hitFlash = 1;
  emitDamage(u.type, u.team, oo.type, oo.team, t.damage, empKind);
  if (oo.hp <= 0) {
    destroyUnit(oi, ctx.ui, ctx.rng, DAMAGE_KIND_TO_KILL_CONTEXT[empKind], ctx.shake);
  }
}

export function dischargeEmp(ctx: CombatContext) {
  const { u, t } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0 || d >= t.attackRange) {
    return;
  }
  u.abilityCooldown = t.fireRate;
  const rangeSq = t.attackRange * t.attackRange;
  const nb = getNeighbors(u.x, u.y, t.attackRange);
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i),
      oo = unit(oi);
    if (!oo.alive || oo.team === u.team) {
      continue;
    }
    if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) >= rangeSq) {
      continue;
    }
    applyEmpDamage(ctx, oi, oo);
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * 6.283,
      r = t.attackRange * 0.8;
    spawnParticle(
      u.x + Math.cos(a) * r,
      u.y + Math.sin(a) * r,
      (ctx.rng() - 0.5) * 25,
      (ctx.rng() - 0.5) * 25,
      0.35,
      3,
      0.5,
      0.5,
      1,
      SH_CIRCLE,
    );
  }
  spawnParticle(u.x, u.y, 0, 0, 0.45, t.attackRange * 0.7, 0.4, 0.4, 1, SH_EXPLOSION_RING);
}

export function castChain(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0) {
    return;
  }
  if (d < ctx.range) {
    u.cooldown = t.fireRate;
    const killer = captureKiller(ctx.ui);
    if (!killer) {
      return;
    }
    chainLightning(u.x, u.y, u.team, t.damage * vd, 5, c, killer, ctx.rng, ctx.shake);
    spawnParticle(u.x, u.y, 0, 0, 0.15, t.size, c[0], c[1], c[2], SH_EXPLOSION_RING);
  }
}
