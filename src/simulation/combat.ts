import { getColor } from '../colors.ts';
import { POOL_PROJECTILES } from '../constants.ts';
import { getProjectile, getUnit } from '../pools.ts';
import type { Color3, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType } from '../unit-types.ts';
import { chainLightning, explosion } from './effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, killUnit, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

const REFLECTOR_BEAM_SHIELD_MULTIPLIER = 0.4;

interface CombatContext {
  u: Unit;
  ui: UnitIndex;
  dt: number;
  c: Color3;
  vd: number;
  t: UnitType;
}

// 再利用オブジェクト — combat() 呼び出しごとにフィールドを上書きして使う
const _ctx: CombatContext = {
  u: getUnit(0 as UnitIndex),
  ui: 0 as UnitIndex,
  dt: 0,
  c: [0, 0, 0],
  vd: 0,
  t: getUnitType(0),
};

function tgtDistOrClear(u: Unit): number {
  if (u.target === NO_UNIT) return -1;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return -1;
  }
  return Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
}

function handleRam(ctx: CombatContext) {
  const { u, ui, t, vd } = ctx;
  const nn = getNeighbors(u.x, u.y, t.size * 2);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o.team === u.team) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < t.size + getUnitType(o.type).size) {
      o.hp -= Math.ceil(u.mass * 3 * vd);
      knockback(oi, u.x, u.y, u.mass * 55);
      u.hp -= Math.ceil(getUnitType(o.type).mass);
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.283;
        spawnParticle(
          (u.x + o.x) / 2,
          (u.y + o.y) / 2,
          Math.cos(a) * (80 + Math.random() * 160),
          Math.sin(a) * (80 + Math.random() * 160),
          0.15,
          2 + Math.random() * 2,
          1,
          0.9,
          0.4,
          0,
        );
      }
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, ui);
      }
      if (u.hp <= 0) {
        killUnit(ui);
        explosion(u.x, u.y, u.team, u.type, NO_UNIT);
        return;
      }
    }
  }
}

function handleHealer(ctx: CombatContext) {
  const { u, ui } = ctx;
  u.abilityCooldown = 0.35;
  const nn = getNeighbors(u.x, u.y, 160);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      o = getUnit(oi);
    if (!o.alive || o.team !== u.team || oi === ui) continue;
    if (o.hp < o.maxHp) {
      o.hp = Math.min(o.maxHp, o.hp + 3);
      addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
    }
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, 10);
}

function handleReflector(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;
  const rr = t.range;
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = getProjectile(i);
    if (!p.alive || p.team === u.team) continue;
    if ((p.x - u.x) * (p.x - u.x) + (p.y - u.y) * (p.y - u.y) < rr * rr) {
      p.vx *= -1.2;
      p.vy *= -1.2;
      p.team = u.team;
      p.r = c[0];
      p.g = c[1];
      p.b = c[2];
      spawnParticle(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.12, 3, c[0], c[1], c[2], 0);
      spawnParticle(p.x, p.y, 0, 0, 0.1, 8, 1, 1, 1, 10);
    }
  }
  if (u.cooldown <= 0 && u.target !== NO_UNIT) {
    const o = getUnit(u.target);
    if (!o.alive) {
      u.target = NO_UNIT;
    } else {
      const dx = o.x - u.x,
        dy = o.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rr) {
        u.cooldown = t.fireRate;
        const ang = Math.atan2(dy, dx);
        spawnProjectile(
          u.x,
          u.y,
          Math.cos(ang) * 400,
          Math.sin(ang) * 400,
          d / 400 + 0.1,
          t.damage * vd,
          u.team,
          1.5,
          c[0],
          c[1],
          c[2],
        );
      }
    }
  }
  if (Math.random() < 0.1) {
    spawnParticle(
      u.x + (Math.random() - 0.5) * rr * 1.5,
      u.y + (Math.random() - 0.5) * rr * 1.5,
      0,
      0,
      0.15,
      2,
      c[0] * 0.5,
      c[1] * 0.5,
      c[2] * 0.5,
      0,
    );
  }
}

function handleCarrier(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;
  u.spawnCooldown -= dt;
  if (u.spawnCooldown <= 0) {
    u.spawnCooldown = 4 + Math.random() * 2;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.283;
      spawnUnit(u.team, 0, u.x + Math.cos(a) * t.size * 2, u.y + Math.sin(a) * t.size * 2);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283;
      spawnParticle(
        u.x + Math.cos(a) * t.size,
        u.y + Math.sin(a) * t.size,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        0.3,
        3,
        c[0],
        c[1],
        c[2],
        0,
      );
    }
  }
}

function handleEmp(ctx: CombatContext) {
  const { u, ui, t } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0 || d >= t.range) return;
  u.abilityCooldown = t.fireRate;
  const nn = getNeighbors(u.x, u.y, t.range);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      oo = getUnit(oi);
    if (!oo.alive || oo.team === u.team) continue;
    if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) < t.range * t.range) {
      oo.stun = 1.5;
      oo.hp -= t.damage;
      if (oo.hp <= 0) {
        killUnit(oi);
        explosion(oo.x, oo.y, oo.team, oo.type, ui);
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * 6.283,
      r = t.range * 0.8;
    spawnParticle(
      u.x + Math.cos(a) * r,
      u.y + Math.sin(a) * r,
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 25,
      0.35,
      3,
      0.5,
      0.5,
      1,
      0,
    );
  }
  spawnParticle(u.x, u.y, 0, 0, 0.45, t.range * 0.7, 0.4, 0.4, 1, 10);
}

function handleTeleporter(ctx: CombatContext) {
  const { u, c, t, dt, vd } = ctx;
  u.teleportTimer -= dt;
  if (u.teleportTimer > 0 || u.target === NO_UNIT) return;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return;
  }
  const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
  if (d < 500 && d > 80) {
    u.teleportTimer = 3 + Math.random() * 2;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283;
      spawnParticle(u.x, u.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.25, 3, c[0], c[1], c[2], 0);
    }
    spawnParticle(u.x, u.y, 0, 0, 0.3, 16, c[0], c[1], c[2], 10);
    const ta = Math.random() * 6.283,
      td = 55 + Math.random() * 35;
    u.x = o.x + Math.cos(ta) * td;
    u.y = o.y + Math.sin(ta) * td;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283;
      spawnParticle(u.x, u.y, Math.cos(a) * 55, Math.sin(a) * 55, 0.2, 3, c[0], c[1], c[2], 0);
    }
    spawnParticle(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, 10);
    for (let i = 0; i < 5; i++) {
      const ba = Math.random() * 6.283;
      spawnProjectile(
        u.x,
        u.y,
        Math.cos(ba) * 430,
        Math.sin(ba) * 430,
        0.3,
        t.damage * vd,
        u.team,
        2,
        c[0],
        c[1],
        c[2],
      );
    }
  }
}

function handleChain(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0) return;
  if (d < t.range) {
    u.cooldown = t.fireRate;
    chainLightning(u.x, u.y, u.team, t.damage * vd, 5, c);
    spawnParticle(u.x, u.y, 0, 0, 0.15, t.size, c[0], c[1], c[2], 10);
  }
}

function fireBeamAtTarget(ctx: CombatContext, o: Unit) {
  const { u, ui, c, t, dt, vd } = ctx;
  const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }
  u.beamOn = Math.min(u.beamOn + dt * 2, 1);
  u.cooldown -= dt;
  if (u.cooldown <= 0) {
    u.cooldown = t.fireRate;
    let dmg = t.damage * u.beamOn * vd;
    if (o.shielded) dmg *= REFLECTOR_BEAM_SHIELD_MULTIPLIER;
    o.hp -= dmg;
    knockback(u.target, u.x, u.y, dmg * 5);
    for (let i = 0; i < 2; i++) {
      spawnParticle(
        o.x + (Math.random() - 0.5) * 8,
        o.y + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        0.08,
        2,
        c[0],
        c[1],
        c[2],
        0,
      );
    }
    if (o.hp <= 0) {
      killUnit(u.target);
      explosion(o.x, o.y, o.team, o.type, ui);
      u.beamOn = 0;
    }
  }
  const bw = (t.size >= 15 ? 6 : 4) * u.beamOn;
  addBeam(
    u.x + Math.cos(u.angle) * t.size * 0.5,
    u.y + Math.sin(u.angle) * t.size * 0.5,
    o.x,
    o.y,
    c[0],
    c[1],
    c[2],
    0.08,
    bw,
  );
}

function handleBeam(ctx: CombatContext): boolean {
  const { u, t, dt } = ctx;
  if (u.target !== NO_UNIT) {
    const o = getUnit(u.target);
    if (o.alive) {
      fireBeamAtTarget(ctx, o);
    } else {
      u.target = NO_UNIT;
      u.beamOn = Math.max(0, u.beamOn - dt * 3);
    }
  } else {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
  }
  return !t.spawns;
}

function fireNormal(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;
  if (u.cooldown > 0 || u.target === NO_UNIT) return;
  const o = getUnit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) return;

  u.cooldown = t.fireRate;
  const ang = Math.atan2(dy, dx);

  if (t.homing) {
    spawnProjectile(
      u.x,
      u.y,
      Math.cos(ang) * 280,
      Math.sin(ang) * 280,
      d / 280 + 1,
      t.damage * vd,
      u.team,
      2.5,
      c[0],
      c[1],
      c[2],
      true,
      0,
      u.target,
    );
  } else if (t.aoe) {
    spawnProjectile(
      u.x,
      u.y,
      Math.cos(ang) * 170,
      Math.sin(ang) * 170,
      d / 170 + 0.2,
      t.damage * vd,
      u.team,
      5,
      c[0] * 0.8,
      c[1] * 0.7 + 0.3,
      c[2],
      false,
      t.aoe,
    );
  } else if (t.shape === 3) {
    for (let i = -2; i <= 2; i++) {
      const ba = ang + i * 0.25;
      spawnProjectile(
        u.x + Math.cos(ba) * t.size,
        u.y + Math.sin(ba) * t.size,
        Math.cos(ba) * 420,
        Math.sin(ba) * 420,
        t.range / 420 + 0.1,
        t.damage * vd,
        u.team,
        2,
        c[0],
        c[1],
        c[2],
      );
    }
  } else if (t.shape === 8) {
    spawnProjectile(
      u.x + Math.cos(ang) * t.size,
      u.y + Math.sin(ang) * t.size,
      Math.cos(ang) * 900,
      Math.sin(ang) * 900,
      t.range / 900 + 0.05,
      t.damage * vd,
      u.team,
      3,
      c[0] * 0.5 + 0.5,
      c[1] * 0.5 + 0.5,
      c[2] * 0.5 + 0.5,
    );
    addBeam(u.x, u.y, u.x + Math.cos(ang) * t.range, u.y + Math.sin(ang) * t.range, c[0], c[1], c[2], 0.1, 1.5);
    for (let i = 0; i < 4; i++) {
      const a2 = ang + (Math.random() - 0.5) * 0.4;
      spawnParticle(
        u.x + Math.cos(ang) * t.size * 1.5,
        u.y + Math.sin(ang) * t.size * 1.5,
        Math.cos(a2) * 160,
        Math.sin(a2) * 160,
        0.08,
        2.5,
        1,
        1,
        0.8,
        0,
      );
    }
  } else {
    const sp = 480 + t.damage * 12;
    spawnProjectile(
      u.x + Math.cos(u.angle) * t.size,
      u.y + Math.sin(u.angle) * t.size,
      Math.cos(ang) * sp + u.vx * 0.3,
      Math.sin(ang) * sp + u.vy * 0.3,
      d / sp + 0.1,
      t.damage * vd,
      u.team,
      1 + t.damage * 0.2,
      c[0],
      c[1],
      c[2],
    );
  }

  if (!t.homing && !t.aoe && t.shape !== 8) {
    for (let i = 0; i < 2; i++) {
      spawnParticle(
        u.x + Math.cos(u.angle) * t.size,
        u.y + Math.sin(u.angle) * t.size,
        Math.cos(ang) * (60 + Math.random() * 60) + (Math.random() - 0.5) * 35,
        Math.sin(ang) * (60 + Math.random() * 60) + (Math.random() - 0.5) * 35,
        0.07,
        2 + Math.random() * 1.5,
        c[0],
        c[1],
        c[2],
        0,
      );
    }
  }
}

export function combat(u: Unit, ui: UnitIndex, dt: number, _now: number) {
  const t = getUnitType(u.type);
  if (u.stun > 0) return;
  u.cooldown -= dt;
  u.abilityCooldown -= dt;
  const c = getColor(u.type, u.team);
  const vd = 1 + u.vet * 0.2;
  _ctx.u = u;
  _ctx.ui = ui;
  _ctx.dt = dt;
  _ctx.c = c;
  _ctx.vd = vd;
  _ctx.t = t;

  if (t.rams) {
    handleRam(_ctx);
    return;
  }
  if (t.heals && u.abilityCooldown <= 0) handleHealer(_ctx);
  if (t.reflects) {
    handleReflector(_ctx);
    return;
  }
  if (t.spawns) handleCarrier(_ctx);
  if (t.emp && u.abilityCooldown <= 0) {
    handleEmp(_ctx);
    return;
  }
  if (t.teleports) handleTeleporter(_ctx);
  if (t.chain && u.cooldown <= 0) {
    handleChain(_ctx);
    return;
  }
  if (t.beam) {
    if (handleBeam(_ctx)) return;
  }
  fireNormal(_ctx);
}
