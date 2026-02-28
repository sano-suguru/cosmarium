import { effectColor } from '../colors.ts';
import { SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { unit } from '../pools.ts';
import type { Color3, UnitIndex } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { absorbByBastionShield, applyTetherAbsorb, ORPHAN_TETHER_PROJECTILE_MULT } from './combat-beam-defense.ts';
import type { CombatContext } from './combat-context.ts';
import { destroyUnit } from './effects.ts';
import { KILL_CONTEXT } from './on-kill-effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, spawnParticle } from './spawn.ts';

export const RAILGUN_SHAPE = 8;
const RAILGUN_SAMPLE_STEP = 100;
const RAILGUN_PIERCE_MULT = 0.6;

interface RayHit {
  oi: UnitIndex;
  dist: number;
}

// GC回避: collectRayHits() のモジュールレベルシングルトン
const _rayHitSeen = new Set<UnitIndex>();
const _rayHits: RayHit[] = [];
function _rayHitCmp(a: RayHit, b: RayHit): number {
  return a.dist - b.dist;
}

function collectRayHits(ox: number, oy: number, dx: number, dy: number, range: number, teamFilter: number): RayHit[] {
  const steps = Math.ceil(range / RAILGUN_SAMPLE_STEP);
  _rayHitSeen.clear();
  for (let s = 0; s <= steps; s++) {
    const d = Math.min(s * RAILGUN_SAMPLE_STEP, range);
    const nn = getNeighbors(ox + dx * d, oy + dy * d, RAILGUN_SAMPLE_STEP);
    for (let j = 0; j < nn; j++) {
      const oi = getNeighborAt(j);
      const o = unit(oi);
      if (o.alive && o.team !== teamFilter) _rayHitSeen.add(oi);
    }
  }
  _rayHits.length = 0;
  for (const oi of _rayHitSeen) {
    const o = unit(oi);
    const tox = o.x - ox;
    const toy = o.y - oy;
    const proj = tox * dx + toy * dy;
    if (proj < 0 || proj > range) continue;
    const perpDistSq = tox * tox + toy * toy - proj * proj;
    const hitSize = unitType(o.type).size;
    if (perpDistSq < hitSize * hitSize) _rayHits.push({ oi, dist: proj });
  }
  _rayHits.sort(_rayHitCmp);
  return _rayHits;
}

function railgunHitFx(x: number, y: number, ang: number, c: Color3, rng: () => number) {
  for (let k = 0; k < 5; k++) {
    const sA = ang + (rng() - 0.5) * 1.75;
    const sSpd = 80 + rng() * 120;
    spawnParticle(x, y, Math.cos(sA) * sSpd, Math.sin(sA) * sSpd, 0.06 + rng() * 0.04, 1.5, 1, 1, 0.7, SH_CIRCLE);
  }
  spawnParticle(x, y, 0, 0, 0.12, 6, c[0], c[1], c[2], SH_EXPLOSION_RING);
}

function applyRailgunHits(
  ctx: CombatContext,
  hits: RayHit[],
  baseDmg: number,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ang: number,
): number {
  let dmg = baseDmg;
  let endDist = ctx.t.range;
  for (const hit of hits) {
    const oi = hit.oi;
    const o = unit(oi);
    if (!o.alive) continue;

    if (o.reflectFieldHp > 0) {
      o.reflectFieldHp = Math.max(0, o.reflectFieldHp - dmg);
      const fc = effectColor(o.type, o.team);
      railgunHitFx(o.x, o.y, ang, fc, ctx.rng);
      return hit.dist;
    }

    let actualDmg = applyTetherAbsorb(o, dmg, ORPHAN_TETHER_PROJECTILE_MULT, ctx.ui, ctx.rng);
    actualDmg = absorbByBastionShield(o, actualDmg);
    o.hp -= actualDmg;
    o.hitFlash = 1;
    knockback(oi, ox + dx * hit.dist, oy + dy * hit.dist, dmg * 12);
    if (o.hp <= 0) destroyUnit(oi, ctx.ui, ctx.rng, KILL_CONTEXT.ProjectileDirect);

    railgunHitFx(o.x, o.y, ang, ctx.c, ctx.rng);
    endDist = hit.dist;
    dmg *= RAILGUN_PIERCE_MULT;
  }
  return endDist;
}

export function fireRailgun(ctx: CombatContext, ang: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;

  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const ox = u.x + dx * t.size;
  const oy = u.y + dy * t.size;

  const hits = collectRayHits(ox, oy, dx, dy, t.range, u.team);
  const beamEndDist = applyRailgunHits(ctx, hits, t.damage * vd, ox, oy, dx, dy, ang);

  const bx = ox + dx * beamEndDist;
  const by = oy + dy * beamEndDist;
  addBeam(u.x, u.y, bx, by, c[0], c[1], c[2], 0.25, 3.0, true);
  addBeam(u.x, u.y, bx, by, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, 0.15, 1.5, true);

  const mx = u.x + dx * t.size * 1.5;
  const my = u.y + dy * t.size * 1.5;
  for (let i = 0; i < 6; i++) {
    const a2 = ang + (ctx.rng() - 0.5) * 0.5;
    const spd = 180 + ctx.rng() * 80;
    spawnParticle(
      mx,
      my,
      Math.cos(a2) * spd,
      Math.sin(a2) * spd,
      0.1 + ctx.rng() * 0.05,
      2.5 + ctx.rng(),
      1,
      1,
      0.8,
      SH_CIRCLE,
    );
  }
  const perpX = -dy;
  const perpY = dx;
  for (let side = -1; side <= 1; side += 2) {
    const lSpd = 60 + ctx.rng() * 40;
    spawnParticle(mx, my, perpX * side * lSpd, perpY * side * lSpd, 0.08, 2, 0.8, 0.8, 1, SH_CIRCLE);
  }
}
