import { effectColor } from '../colors.ts';
import { SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { decMotherships, decUnits, teamUnitCounts } from '../pools.ts';
import { unit } from '../pools-query.ts';
import { addAberration, addFlash, addFreeze } from '../screen-effects.ts';
import type { Team } from '../team.ts';
import type { Color3, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { isMothership, unitType } from '../unit-type-accessors.ts';
import type { ShakeFn } from './combat-context.ts';
import type { KillContext } from './on-kill-effects.ts';
import { applyOnKillEffects } from './on-kill-effects.ts';
import { getNeighbors, knockback } from './spatial-hash.ts';
import type { Killer } from './spawn.ts';
import { spawnParticle } from './spawn.ts';
import { dispatchKillEvent } from './spawn-hooks.ts';

interface KilledUnitSnapshot {
  readonly x: number;
  readonly y: number;
  readonly team: Team;
  readonly type: UnitTypeIndex;
}

export function killUnit(
  i: UnitIndex,
  killer: Killer | undefined,
  killContext: KillContext,
): KilledUnitSnapshot | undefined {
  const u = unit(i);
  if (u.alive) {
    const snap: KilledUnitSnapshot = { x: u.x, y: u.y, team: u.team, type: u.type };
    const squadronIdx = u.squadronIdx;
    u.alive = false;
    decUnits(u.team);
    if (isMothership(u.type)) {
      decMotherships(u.team);
    }
    dispatchKillEvent(i, u.team, u.type, squadronIdx, killContext, killer, teamUnitCounts[u.team]);
    return snap;
  }
  return undefined;
}

function spawnExplosionDebris(x: number, y: number, size: number, cost: number, c: Color3, rng: () => number) {
  // 上限 80: explosion 1回の最大パーティクル数を制限（pool容量 45,000 に対して十分余裕あり）
  const cnt = Math.min(80, Math.max(18, cost * 4 + size));
  for (let i = 0; i < cnt; i++) {
    const a = rng() * 6.283;
    const sp = 40 + rng() * 200 * (size / 10);
    const lf = 0.3 + rng() * 0.8;
    spawnParticle(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      lf,
      2 + rng() * size * 0.4,
      c[0] * 0.5 + 0.5,
      c[1] * 0.5 + 0.5,
      c[2] * 0.5 + 0.5,
      SH_CIRCLE,
    );
  }
}

function spawnExplosionFlash(x: number, y: number, size: number, cost: number, rng: () => number) {
  const count = cost >= 12 ? 10 : 5;
  for (let i = 0; i < count; i++) {
    const a = rng() * 6.283;
    spawnParticle(
      x,
      y,
      Math.cos(a) * rng() * 50,
      Math.sin(a) * rng() * 50,
      0.1 + rng() * 0.12,
      size * 0.7 + rng() * 3,
      1,
      1,
      1,
      SH_CIRCLE,
    );
  }
}

function applyKnockbackToNeighbors(x: number, y: number, size: number) {
  const nb = getNeighbors(x, y, size * 8);
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i);
    const o = unit(oi);
    if (!o.alive) {
      continue;
    }
    const ddx = o.x - x,
      ddy = o.y - y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    if (dd < size * 8) {
      knockback(oi, x, y, (size * 50) / (dd * 0.1 + 1));
    }
  }
}

/**
 * killer のスナップショット (team/type) とプールスロットの現在値を照合し、
 * スロット再利用でない場合のみ kills/vet を加算する。
 */
function updateKillerVet(killer: Killer) {
  const ku = unit(killer.index);
  if (ku.alive && ku.team === killer.team && ku.type === killer.type) {
    ku.kills++;
    if (ku.kills >= 3) {
      ku.vet = 1;
    }
    if (ku.kills >= 8) {
      ku.vet = 2;
    }
  }
}

export function explosion(x: number, y: number, team: Team, type: UnitTypeIndex, rng: () => number, shake: ShakeFn) {
  const ut = unitType(type);
  const size = ut.size;
  const cost = ut.cost;
  const c = effectColor(type, team);

  spawnExplosionDebris(x, y, size, cost, c, rng);
  spawnExplosionFlash(x, y, size, cost, rng);

  const dc = Math.min((size * 2) | 0, 14);
  for (let i = 0; i < dc; i++) {
    const a = rng() * 6.283;
    const sp = 15 + rng() * 140;
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + rng() * 2, 1 + rng() * 2, 0.5, 0.35, 0.2, SH_CIRCLE);
  }
  spawnParticle(x, y, 0, 0, 0.45, size * 2.5, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, SH_EXPLOSION_RING);
  spawnParticle(x, y, 0, 0, 0.15, size * 1.5, 1, 1, 1, SH_CIRCLE);
  spawnParticle(x, y, 0, 0, 0.2, size * 1.8, c[0], c[1], c[2], SH_EXPLOSION_RING);

  if (cost >= 8) {
    spawnParticle(x, y, 0, 0, 0.55, size * 2.5 * 1.3, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, SH_EXPLOSION_RING);
    spawnParticle(x, y, 0, 0, 0.3, size * 1.8 * 1.3, c[0], c[1], c[2], SH_EXPLOSION_RING);
    shake(size * 1.2, x, y);
    addAberration(cost / 30);
    if (cost >= 12) {
      addFlash(cost / 25);
    }
    if (cost >= 20) {
      addFreeze(0.07);
    } else if (cost >= 12) {
      addFreeze(0.05);
    } else {
      addFreeze(0.03);
    }
  } else if (size >= 14) {
    shake(size * 0.8, x, y);
  }

  applyKnockbackToNeighbors(x, y, size);
}

function resolveKiller(killer: UnitIndex | Killer): Killer | undefined {
  if (typeof killer === 'number') {
    if (killer === NO_UNIT) {
      return undefined;
    }
    const ku = unit(killer);
    return ku.alive ? { index: killer, team: ku.team, type: ku.type } : undefined;
  }
  return killer.index === NO_UNIT ? undefined : killer;
}

export function destroyUnit(
  i: UnitIndex,
  killer: UnitIndex | Killer,
  rng: () => number,
  killContext: KillContext,
  shake: ShakeFn,
): void {
  const resolved = resolveKiller(killer);
  const snap = killUnit(i, resolved, killContext);
  if (snap) {
    explosion(snap.x, snap.y, snap.team, snap.type, rng, shake);
    if (resolved) {
      updateKillerVet(resolved);
      applyOnKillEffects(resolved.index, resolved.team, killContext);
    }
  }
}

export function destroyMutualKill(
  a: UnitIndex,
  b: UnitIndex,
  aHpDepleted: boolean,
  bHpDepleted: boolean,
  rng: () => number,
  killContext: KillContext,
  shake: ShakeFn,
): void {
  const killerA: Killer = { index: a, team: unit(a).team, type: unit(a).type };
  const killerB: Killer = { index: b, team: unit(b).team, type: unit(b).type };
  // kill は両方のスナップショット取得後（順序重要）
  let snapB: ReturnType<typeof killUnit>;
  let snapA: ReturnType<typeof killUnit>;
  if (bHpDepleted) {
    snapB = killUnit(b, killerA, killContext);
  }
  if (aHpDepleted) {
    snapA = killUnit(a, killerB, killContext);
  }

  if (snapB) {
    explosion(snapB.x, snapB.y, snapB.team, snapB.type, rng, shake);
  }
  if (snapA) {
    explosion(snapA.x, snapA.y, snapA.team, snapA.type, rng, shake);
  }

  // vet加算 + on-kill効果（相打ちではkillerもdeadのため除外）
  const isMutualKill = aHpDepleted && bHpDepleted;
  if (!isMutualKill) {
    if (snapB) {
      updateKillerVet(killerA);
      applyOnKillEffects(killerA.index, killerA.team, killContext);
    }
    if (snapA) {
      updateKillerVet(killerB);
      applyOnKillEffects(killerB.index, killerB.team, killContext);
    }
  }
}
