import { effectColor } from '../colors.ts';
import { SH_CIRCLE, SH_DIAMOND, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { knockback } from './spatial-hash.ts';
import { addBeam, spawnParticle } from './spawn.ts';

export const REFLECT_BEAM_DAMAGE_MULT = 0.5;
export const BASTION_ABSORB_RATIO = 0.4;
export const BASTION_SELF_ABSORB_RATIO = 0.3;
export const ORPHAN_TETHER_BEAM_MULT = 0.8;
export const ORPHAN_TETHER_PROJECTILE_MULT = 0.7;

/** 被弾ユニット→Bastion方向のエネルギーフローパーティクルを放出 */
function tetherAbsorbFx(ox: number, oy: number, tx: number, ty: number, rng: () => number) {
  const dx = tx - ox,
    dy = ty - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 1) return;
  const nx = dx / dist,
    ny = dy / dist;
  for (let k = 0; k < 4; k++) {
    const speed = 120 + rng() * 80;
    const lat = (rng() - 0.5) * 40;
    spawnParticle(
      ox + nx * (rng() * dist * 0.3),
      oy + ny * (rng() * dist * 0.3),
      nx * speed + ny * lat,
      ny * speed - nx * lat,
      0.2 + rng() * 0.1,
      1.8,
      0.5,
      0.85,
      1.0,
      SH_DIAMOND,
    );
  }
}

export function consumeReflectorShieldHp(u: Unit, damage: number, cooldown: number) {
  const prev = u.energy;
  u.energy = Math.max(0, prev - damage);
  if (prev > 0 && u.energy <= 0) {
    u.shieldCooldown = cooldown;
  }
}

/** Reflector反射とBastionシールド反射の共通処理を集約（重複排除） */
function reflectBeamDamage(n: Unit, ni: UnitIndex, baseDmg: number, rng: () => number, killerIndex: UnitIndex): void {
  const attacker = unit(killerIndex);
  if (!attacker.alive) return;

  const c = effectColor(n.type, n.team);

  addBeam(n.x, n.y, attacker.x, attacker.y, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.08, 3);
  spawnParticle(n.x, n.y, 0, 0, 0.15, 12, c[0], c[1], c[2], SH_EXPLOSION_RING);

  const reflectDmg = baseDmg * REFLECT_BEAM_DAMAGE_MULT;
  attacker.hp -= reflectDmg;
  attacker.hitFlash = 1;
  knockback(killerIndex, n.x, n.y, reflectDmg * 5);

  for (let j = 0; j < 4; j++) {
    spawnParticle(
      attacker.x + (rng() - 0.5) * 8,
      attacker.y + (rng() - 0.5) * 8,
      (rng() - 0.5) * 60,
      (rng() - 0.5) * 60,
      0.1,
      2.5,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }

  if (attacker.hp <= 0) {
    destroyUnit(killerIndex, ni, rng, KILL_CONTEXT.Beam);
  }
}

function tryReflectBeam(n: Unit, ni: UnitIndex, baseDmg: number, rng: () => number, killerIndex: UnitIndex): boolean {
  const nt = unitType(n.type);
  if (!nt.reflects || n.energy <= 0 || n.shieldCooldown > 0) return false;
  consumeReflectorShieldHp(n, baseDmg, nt.shieldCooldown);
  reflectBeamDamage(n, ni, baseDmg, rng, killerIndex);
  return true;
}

function tryReflectFieldBeam(
  n: Unit,
  ni: UnitIndex,
  baseDmg: number,
  rng: () => number,
  killerIndex: UnitIndex,
): boolean {
  if (n.reflectFieldHp <= 0) return false;
  n.reflectFieldHp = Math.max(0, n.reflectFieldHp - baseDmg);
  reflectBeamDamage(n, ni, baseDmg, rng, killerIndex);
  return true;
}

export function absorbByBastionShield(u: Unit, dmg: number): number {
  const t = unitType(u.type);
  if (!t.shields || u.energy <= 0) return dmg;
  const absorbed = Math.min(dmg * BASTION_SELF_ABSORB_RATIO, u.energy);
  u.energy -= absorbed;
  return dmg - absorbed;
}

/**
 * テザー吸収: shieldLingerTimer 中の Bastion が肩代わりするダメージ計算。
 * 吸収FXは内部で直接発火。Bastion 死亡時は killUnit + explosion 実行。
 * 軽減後のダメージを返す。
 */
export function applyTetherAbsorb(
  n: Unit,
  dmg: number,
  orphanMult: number,
  killerIndex: UnitIndex,
  rng: () => number,
): number {
  if (n.shieldLingerTimer > 0 && n.shieldSourceUnit !== NO_UNIT) {
    const src = unit(n.shieldSourceUnit);
    if (src.alive && unitType(src.type).shields) {
      src.hp -= dmg * BASTION_ABSORB_RATIO;
      src.hitFlash = 1;
      tetherAbsorbFx(n.x, n.y, src.x, src.y, rng);
      if (src.hp <= 0) {
        destroyUnit(n.shieldSourceUnit, killerIndex, rng, KILL_CONTEXT.Beam);
        n.shieldSourceUnit = NO_UNIT;
      }
      return dmg * (1 - BASTION_ABSORB_RATIO);
    }
    n.shieldSourceUnit = NO_UNIT;
    return dmg * orphanMult;
  }
  if (n.shieldLingerTimer > 0) return dmg * orphanMult;
  return dmg;
}

/** ビームダメージの反射/吸収/軽減を適用。反射成功時は -1 を返す（ダメージスキップ）*/
export function applyBeamDefenses(
  n: Unit,
  ni: UnitIndex,
  baseDmg: number,
  rng: () => number,
  killerIndex: UnitIndex,
): number {
  if (tryReflectBeam(n, ni, baseDmg, rng, killerIndex)) return -1;
  if (tryReflectFieldBeam(n, ni, baseDmg, rng, killerIndex)) return -1;
  let dmg = applyTetherAbsorb(n, baseDmg, ORPHAN_TETHER_BEAM_MULT, killerIndex, rng);
  dmg = absorbByBastionShield(n, dmg);
  return dmg;
}
