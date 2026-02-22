import { color } from '../colors.ts';
import { POOL_PROJECTILES, REF_FPS, SH_CIRCLE, SH_DIAMOND_RING, SH_EXPLOSION_RING } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { poolCounts, projectile, unit } from '../pools.ts';
import type { Color3, DemoFlag, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { FLAGSHIP_ENGINE_OFFSETS, unitType } from '../unit-types.ts';
import { chainLightning, explosion } from './effects.ts';
import { getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addBeam, killUnit, onKillUnit, spawnParticle, spawnProjectile, spawnUnit } from './spawn.ts';

const REFLECTOR_BEAM_SHIELD_MULTIPLIER = 0.4;
const REFLECTOR_WEAK_SHOT_SPEED = 400;

// GC回避: aimAt() の結果を再利用するシングルトン
const _aim = { ang: 0, dist: 0 };

/** 二次方程式 at²+bt+c=0 の最小正の実数解。解なしなら -1 */
function smallestPositiveRoot(a: number, b: number, c: number): number {
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;

  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return -1;
    const t = -c / b;
    return t > 0 ? t : -1;
  }
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t1 > 0 && t2 > 0) return Math.min(t1, t2);
  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return -1;
}

function setDirect(ang: number, dist: number): { ang: number; dist: number } {
  _aim.ang = ang;
  _aim.dist = dist;
  return _aim;
}

/**
 * 偏差射撃を考慮した照準角度と予測距離を返す。
 * 二次方程式でインターセプト地点を求め、accuracy (0–1) で直射とブレンドする。
 */
export function aimAt(
  ux: number,
  uy: number,
  ox: number,
  oy: number,
  ovx: number,
  ovy: number,
  speed: number,
  accuracy: number,
): { ang: number; dist: number } {
  const dx = ox - ux;
  const dy = oy - uy;
  const directAng = Math.atan2(dy, dx);
  const directDist = Math.sqrt(dx * dx + dy * dy);

  if (accuracy <= 0 || speed <= 0) return setDirect(directAng, directDist);

  // |P + V*t|² = (s*t)²  →  (V²-s²)t² + 2(P·V)t + P·P = 0
  const t = smallestPositiveRoot(ovx * ovx + ovy * ovy - speed * speed, 2 * (dx * ovx + dy * ovy), dx * dx + dy * dy);
  if (t <= 0) return setDirect(directAng, directDist);

  const px = dx + ovx * t;
  const py = dy + ovy * t;
  const leadAng = Math.atan2(py, px);
  const leadDist = Math.sqrt(px * px + py * py);

  // accuracy でブレンド（角度は最短弧で補間）
  let angleDiff = leadAng - directAng;
  if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  _aim.ang = directAng + angleDiff * accuracy;
  _aim.dist = directDist + (leadDist - directDist) * accuracy;
  return _aim;
}

const SWEEP_DURATION = 0.8;
const BURST_INTERVAL = 0.07;
const HALF_ARC = 0.524; // ±30°
const RAILGUN_SHAPE = 8;
const RAILGUN_SPEED = 900;
const FLAGSHIP_MAIN_GUN_SPEED = 380;
const FLAGSHIP_CHARGE_TIME = 0.3;
const FLAGSHIP_BROADSIDE_DELAY = 0.15;
const BROADSIDE_PHASE_CHARGE = 0;
const BROADSIDE_PHASE_FIRE = -1;
const AOE_PROJ_SPEED = 170;
const AOE_PROJ_SIZE = 5;
const sweepHitMap = new Map<UnitIndex, Set<UnitIndex>>();
/** 同一フレーム内で反射済みのプロジェクタイルインデックス。対向リフレクター間の無限バウンスを防止 */
const reflectedThisFrame = new Set<number>();

export function _resetSweepHits() {
  sweepHitMap.clear();
}

export function resetReflected() {
  reflectedThisFrame.clear();
}

onKillUnit((i) => sweepHitMap.delete(i));

interface CombatContext {
  u: Unit;
  ui: UnitIndex;
  dt: number;
  c: Color3;
  vd: number;
  t: UnitType;
  rng: () => number;
}

// GC回避用の再利用シングルトン。combat() 呼び出し時に全フィールドを上書きする。
// シングルスレッド前提: ワーカー分離時は per-call 割り当てに変更が必要
const _ctx: CombatContext = {
  u: unit(0 as UnitIndex),
  ui: 0 as UnitIndex,
  dt: 0,
  c: [0, 0, 0],
  vd: 0,
  t: unitType(0),
  rng: () => {
    throw new Error('CombatContext.rng called before combat() initialization');
  },
};

function tgtDistOrClear(u: Unit): number {
  if (u.target === NO_UNIT) return -1;
  const o = unit(u.target);
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
      o = unit(oi);
    if (!o.alive || o.team === u.team) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < t.size + unitType(o.type).size) {
      o.hp -= Math.ceil(u.mass * 3 * vd);
      o.hitFlash = 1;
      knockback(oi, u.x, u.y, u.mass * 55);
      u.hp -= Math.ceil(unitType(o.type).mass);
      for (let k = 0; k < 10; k++) {
        const a = ctx.rng() * 6.283;
        spawnParticle(
          (u.x + o.x) / 2,
          (u.y + o.y) / 2,
          Math.cos(a) * (80 + ctx.rng() * 160),
          Math.sin(a) * (80 + ctx.rng() * 160),
          0.15,
          2 + ctx.rng() * 2,
          1,
          0.9,
          0.4,
          SH_CIRCLE,
        );
      }
      if (o.hp <= 0) {
        killUnit(oi);
        explosion(o.x, o.y, o.team, o.type, ui, ctx.rng);
      }
      if (u.hp <= 0) {
        killUnit(ui);
        explosion(u.x, u.y, u.team, u.type, NO_UNIT, ctx.rng);
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
      o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === ui) continue;
    if (o.hp < o.maxHp) {
      o.hp = Math.min(o.maxHp, o.hp + 3);
      addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
    }
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, SH_EXPLOSION_RING);
}

const REFLECT_RADIUS_MULT = 3;
const REFLECT_SCATTER = 0.524; // 全幅30°（±15°）
const REFLECT_SPEED_MULT = 1.0;
const REFLECT_LIFE = 0.5;

function reflectProjectile(
  ctx: CombatContext,
  ux: number,
  uy: number,
  p: { x: number; y: number; vx: number; vy: number; life: number; team: number; r: number; g: number; b: number },
  team: number,
  c: Color3,
) {
  let dx = p.x - ux;
  let dy = p.y - uy;
  let nd = Math.sqrt(dx * dx + dy * dy);
  if (nd < 0.001) {
    // 弾がReflector中心と一致: 速度の逆方向を法線として使用
    dx = -p.vx;
    dy = -p.vy;
    nd = Math.sqrt(dx * dx + dy * dy) || 1;
  }
  const nx = dx / nd;
  const ny = dy / nd;
  // v' = v - 2(v·n)n
  const dot = p.vx * nx + p.vy * ny;
  const rvx = p.vx - 2 * dot * nx;
  const rvy = p.vy - 2 * dot * ny;
  const scatter = (ctx.rng() - 0.5) * REFLECT_SCATTER;
  const cs = Math.cos(scatter);
  const sn = Math.sin(scatter);
  p.vx = (rvx * cs - rvy * sn) * REFLECT_SPEED_MULT;
  p.vy = (rvx * sn + rvy * cs) * REFLECT_SPEED_MULT;
  p.life = REFLECT_LIFE;
  p.team = team;
  p.r = c[0];
  p.g = c[1];
  p.b = c[2];
  addBeam(ux, uy, p.x, p.y, c[0], c[1], c[2], 0.15, 1.5);
  for (let j = 0; j < 4; j++) {
    spawnParticle(
      p.x,
      p.y,
      (ctx.rng() - 0.5) * 80,
      (ctx.rng() - 0.5) * 80,
      0.15,
      3 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
  spawnParticle(p.x, p.y, 0, 0, 0.12, 10, 1, 1, 1, SH_EXPLOSION_RING);
}

function reflectNearbyProjectiles(ctx: CombatContext, u: Unit, reflectR: number, team: number, c: Color3) {
  for (let i = 0, rem = poolCounts.projectiles; i < POOL_PROJECTILES && rem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) continue;
    rem--;
    if (reflectedThisFrame.has(i) || p.team === team) continue;
    const dx = p.x - u.x;
    const dy = p.y - u.y;
    if (dx * dx + dy * dy < reflectR * reflectR) {
      reflectProjectile(ctx, u.x, u.y, p, team, c);
      reflectedThisFrame.add(i);
    }
  }
}

function handleReflector(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;
  const fireRange = t.range;
  const reflectR = t.size * REFLECT_RADIUS_MULT;
  reflectNearbyProjectiles(ctx, u, reflectR, u.team, c);
  if (u.cooldown <= 0 && u.target !== NO_UNIT) {
    const o = unit(u.target);
    if (!o.alive) {
      u.target = NO_UNIT;
    } else {
      const dx = o.x - u.x,
        dy = o.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < fireRange) {
        u.cooldown = t.fireRate;
        const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, REFLECTOR_WEAK_SHOT_SPEED, t.leadAccuracy);
        spawnProjectile(
          u.x,
          u.y,
          Math.cos(aim.ang) * REFLECTOR_WEAK_SHOT_SPEED,
          Math.sin(aim.ang) * REFLECTOR_WEAK_SHOT_SPEED,
          aim.dist / REFLECTOR_WEAK_SHOT_SPEED + 0.1,
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
  if (ctx.rng() < 1 - 0.9 ** (ctx.dt * REF_FPS)) {
    spawnParticle(
      u.x + (ctx.rng() - 0.5) * fireRange * 1.5,
      u.y + (ctx.rng() - 0.5) * fireRange * 1.5,
      0,
      0,
      0.15,
      2,
      c[0] * 0.5,
      c[1] * 0.5,
      c[2] * 0.5,
      SH_CIRCLE,
    );
  }
}

function handleCarrier(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;
  u.spawnCooldown -= dt;
  if (u.spawnCooldown <= 0) {
    u.spawnCooldown = 4 + ctx.rng() * 2;
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * 6.283;
      spawnUnit(u.team, 0, u.x + Math.cos(a) * t.size * 2, u.y + Math.sin(a) * t.size * 2, ctx.rng);
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

function handleEmp(ctx: CombatContext) {
  const { u, t } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0 || d >= t.range) return;
  u.abilityCooldown = t.fireRate;
  const nn = getNeighbors(u.x, u.y, t.range);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i),
      oo = unit(oi);
    if (!oo.alive || oo.team === u.team) continue;
    if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) < t.range * t.range) {
      oo.stun = 1.5;
      oo.hp -= t.damage;
      oo.hitFlash = 1;
      if (oo.hp <= 0) {
        killUnit(oi);
        explosion(oo.x, oo.y, oo.team, oo.type, ctx.ui, ctx.rng);
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * 6.283,
      r = t.range * 0.8;
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
  spawnParticle(u.x, u.y, 0, 0, 0.45, t.range * 0.7, 0.4, 0.4, 1, SH_EXPLOSION_RING);
}

const BLINK_COUNT = 3;
const WARP_DELAY = 0.25;
const BLINK_GAP = 0.09;
const BLINK_SHOTS = 2;
const BLINK_DIST_MIN = 100;
const BLINK_DIST_MAX = 220;
const BLINK_CD_MIN = 2.5;
const BLINK_CD_RNG = 1.5;
const BLINK_SHOT_SPEED = 520;
const BLINK_ACCURACY = 0.7;
const BLINK_SHOT_SPREAD = 0.04;
const BLINK_IMPACT_RADIUS = 80;
const BLINK_IMPACT_KNOCKBACK = 200;
const BLINK_IMPACT_STUN = 0.25;

/** @pre u.target !== NO_UNIT && unit(u.target).alive — 呼び出し元で検証済み */
function blinkDepart(ctx: CombatContext) {
  const { u, c } = ctx;
  const o = unit(u.target);

  const prevX = u.x;
  const prevY = u.y;

  for (let i = 0; i < 6; i++) {
    const a = ctx.rng() * 6.283;
    spawnParticle(u.x, u.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.25, 3, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(u.x, u.y, 0, 0, 0.2, 12, c[0], c[1], c[2], SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.25, 8, c[0], c[1], c[2], SH_DIAMOND_RING);

  // ターゲット背面側(120°-240°)にランダム出現
  const baseAng = Math.atan2(o.y - prevY, o.x - prevX);
  const zigzag = baseAng + (2.094 + ctx.rng() * 2.094);
  const dist = BLINK_DIST_MIN + ctx.rng() * (BLINK_DIST_MAX - BLINK_DIST_MIN);
  u.x = o.x + Math.cos(zigzag) * dist;
  u.y = o.y + Math.sin(zigzag) * dist;

  addBeam(prevX, prevY, u.x, u.y, c[0], c[1], c[2], 0.28, 3, true);

  u.angle = Math.atan2(o.y - u.y, o.x - u.x);

  u.blinkPhase = 1;
}

function blinkArrive(ctx: CombatContext) {
  const { u, c, t, vd } = ctx;

  u.blinkPhase = 0;

  for (let i = 0; i < 8; i++) {
    const a = ctx.rng() * 6.283;
    spawnParticle(u.x, u.y, Math.cos(a) * 90, Math.sin(a) * 90, 0.3, 3.5, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(u.x, u.y, 0, 0, 0.25, 16, c[0], c[1], c[2], SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, SH_EXPLOSION_RING);
  spawnParticle(u.x, u.y, 0, 0, 0.25, 10, c[0], c[1], c[2], SH_DIAMOND_RING);

  addShake(1.2);

  const nn = getNeighbors(u.x, u.y, BLINK_IMPACT_RADIUS);
  for (let i = 0; i < nn; i++) {
    const oi = getNeighborAt(i);
    const o = unit(oi);
    if (!o.alive || o.team === u.team) continue;
    knockback(oi, u.x, u.y, BLINK_IMPACT_KNOCKBACK);
    o.stun = Math.max(o.stun, BLINK_IMPACT_STUN);
  }

  if (u.target !== NO_UNIT) {
    const o = unit(u.target);
    if (o.alive) {
      const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, BLINK_SHOT_SPEED, BLINK_ACCURACY);
      for (let i = 0; i < BLINK_SHOTS; i++) {
        const spread = (ctx.rng() - 0.5) * BLINK_SHOT_SPREAD * 2;
        const shotAng = aim.ang + spread;
        spawnProjectile(
          u.x,
          u.y,
          Math.cos(shotAng) * BLINK_SHOT_SPEED,
          Math.sin(shotAng) * BLINK_SHOT_SPEED,
          aim.dist / BLINK_SHOT_SPEED + 0.1,
          t.damage * vd,
          u.team,
          2,
          c[0],
          c[1],
          c[2],
          false,
          0,
          undefined,
          0,
          ctx.ui,
        );
      }
      u.angle = aim.ang;
    }
  }

  u.blinkCount--;
  u.teleportTimer = u.blinkCount > 0 ? BLINK_GAP : BLINK_CD_MIN + ctx.rng() * BLINK_CD_RNG;
  u.cooldown = Math.max(u.cooldown, BLINK_GAP + 0.05);
}

function handleTeleporter(ctx: CombatContext) {
  const { u, dt } = ctx;
  u.teleportTimer -= dt;
  if (u.teleportTimer > 0) return;

  if (u.blinkPhase === 1) {
    blinkArrive(ctx);
    return;
  }

  if (u.target === NO_UNIT) {
    u.blinkCount = 0;
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.blinkCount = 0;
    return;
  }

  if (u.blinkCount > 0) {
    blinkDepart(ctx);
    u.teleportTimer = WARP_DELAY;
    u.cooldown = Math.max(u.cooldown, WARP_DELAY + 0.05);
    return;
  }

  const dx = o.x - u.x;
  const dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 80 && d < 600) {
    u.blinkCount = BLINK_COUNT;
    blinkDepart(ctx);
    u.teleportTimer = WARP_DELAY;
    u.cooldown = Math.max(u.cooldown, WARP_DELAY + 0.05);
  }
}

function handleChain(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const d = tgtDistOrClear(u);
  if (d < 0) return;
  if (d < t.range) {
    u.cooldown = t.fireRate;
    chainLightning(u.x, u.y, u.team, t.damage * vd, 5, c, ctx.rng);
    spawnParticle(u.x, u.y, 0, 0, 0.15, t.size, c[0], c[1], c[2], SH_EXPLOSION_RING);
  }
}

function sweepThroughDamage(ctx: CombatContext, prevAngle: number, currAngle: number) {
  const { u, c, t, vd } = ctx;
  const base = u.sweepBaseAngle;
  const TOL = 0.05;
  const nn = getNeighbors(u.x, u.y, t.range);

  const normalize = (a: number): number => {
    let r = a - base;
    while (r > Math.PI) r -= Math.PI * 2;
    while (r < -Math.PI) r += Math.PI * 2;
    return r;
  };

  const relPrev = normalize(prevAngle);
  const relCurr = normalize(currAngle);
  const lo = Math.min(relPrev, relCurr) - TOL;
  const hi = Math.max(relPrev, relCurr) + TOL;

  for (let i = 0; i < nn; i++) {
    const ni = getNeighborAt(i);
    const n = unit(ni);
    if (!n.alive || n.team === u.team) continue;
    const ndx = n.x - u.x,
      ndy = n.y - u.y;
    const nd = Math.sqrt(ndx * ndx + ndy * ndy);
    if (nd >= t.range) continue;
    const nAngle = Math.atan2(ndy, ndx);
    const relEnemy = normalize(nAngle);
    if (relEnemy < lo || relEnemy > hi) continue;
    if (sweepHitMap.get(ctx.ui)?.has(ni)) continue;
    sweepHitMap.get(ctx.ui)?.add(ni);
    let dmg = t.damage * vd;
    if (n.shieldLingerTimer > 0) dmg *= REFLECTOR_BEAM_SHIELD_MULTIPLIER;
    n.hp -= dmg;
    n.hitFlash = 1;
    knockback(ni, u.x, u.y, dmg * 3);
    spawnParticle(
      n.x + (ctx.rng() - 0.5) * 8,
      n.y + (ctx.rng() - 0.5) * 8,
      (ctx.rng() - 0.5) * 50,
      (ctx.rng() - 0.5) * 50,
      0.08,
      2,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
    if (n.hp <= 0) {
      killUnit(ni);
      explosion(n.x, n.y, n.team, n.type, ctx.ui, ctx.rng);
    }
  }
}

function sweepAfterimage(u: Unit, ox: number, oy: number, easeAt: (p: number) => number, c: Color3, range: number) {
  const trails: [number, number, number, number][] = [
    [0.08, 0.35, 4, 0.1],
    [0.18, 0.15, 2.5, 0.12],
  ];
  for (const [phaseOffset, colorMul, width, opacity] of trails) {
    if (u.sweepPhase > phaseOffset) {
      const angle = u.sweepBaseAngle + easeAt(u.sweepPhase - phaseOffset);
      addBeam(
        ox,
        oy,
        u.x + Math.cos(angle) * range,
        u.y + Math.sin(angle) * range,
        c[0] * colorMul,
        c[1] * colorMul,
        c[2] * colorMul,
        opacity,
        width,
        false,
        2,
      );
    }
  }
}

function sweepTipSpark(ctx: CombatContext, x: number, y: number, c: Color3, dt: number) {
  if (ctx.rng() < 1 - 0.45 ** (dt * REF_FPS)) {
    const a = ctx.rng() * Math.PI * 2;
    const s = 40 + ctx.rng() * 100;
    spawnParticle(
      x,
      y,
      Math.cos(a) * s,
      Math.sin(a) * s,
      0.12 + ctx.rng() * 0.1,
      3 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
}

function sweepPathParticles(
  ctx: CombatContext,
  ox: number,
  oy: number,
  endX: number,
  endY: number,
  beamAngle: number,
  c: Color3,
  dt: number,
) {
  if (ctx.rng() < 1 - 0.7 ** (dt * REF_FPS)) {
    const along = 0.3 + ctx.rng() * 0.6;
    const px = ox + (endX - ox) * along;
    const py = oy + (endY - oy) * along;
    const drift = (ctx.rng() - 0.5) * 30;
    const perp = beamAngle + Math.PI * 0.5;
    spawnParticle(
      px + Math.cos(perp) * drift,
      py + Math.sin(perp) * drift,
      (ctx.rng() - 0.5) * 20,
      (ctx.rng() - 0.5) * 20,
      0.06 + ctx.rng() * 0.04,
      1.5 + ctx.rng() * 1.5,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
}

function sweepGlowRing(ctx: CombatContext, x: number, y: number, c: Color3, dt: number) {
  if (ctx.rng() < 1 - 0.75 ** (dt * REF_FPS)) {
    spawnParticle(x, y, 0, 0, 0.1, 12 + ctx.rng() * 6, c[0], c[1], c[2], SH_EXPLOSION_RING);
  }
}

function handleSweepBeam(ctx: CombatContext) {
  const { u, c, t, dt } = ctx;

  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
    return;
  }

  if (u.sweepPhase === 0 && u.cooldown > 0) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }

  if (u.sweepPhase === 0) {
    // 直射角度を使用（sweep系は現状 leadAccuracy=0 のため偏差射撃不要）
    u.sweepBaseAngle = Math.atan2(dy, dx);
    u.sweepPhase = 0.001;
    u.beamOn = 1;
    sweepHitMap.set(ctx.ui, new Set());
  }

  const prevPhase = u.sweepPhase;
  u.sweepPhase = Math.min(u.sweepPhase + dt / SWEEP_DURATION, 1);

  // smoothstep: +HALF_ARC → -HALF_ARC
  const easeAt = (p: number): number => {
    const e = p * p * (3 - 2 * p);
    return HALF_ARC - e * HALF_ARC * 2;
  };
  const prevOffset = easeAt(prevPhase);
  const currOffset = easeAt(u.sweepPhase);
  const prevAngle = u.sweepBaseAngle + prevOffset;
  const currAngle = u.sweepBaseAngle + currOffset;

  const beamEndX = u.x + Math.cos(currAngle) * t.range;
  const beamEndY = u.y + Math.sin(currAngle) * t.range;
  const ox = u.x + Math.cos(u.angle) * t.size * 0.5;
  const oy = u.y + Math.sin(u.angle) * t.size * 0.5;
  addBeam(ox, oy, beamEndX, beamEndY, c[0], c[1], c[2], 0.06, 6, true);

  sweepAfterimage(u, ox, oy, easeAt, c, t.range);
  sweepTipSpark(ctx, beamEndX, beamEndY, c, dt);
  sweepPathParticles(ctx, ox, oy, beamEndX, beamEndY, currAngle, c, dt);
  sweepGlowRing(ctx, beamEndX, beamEndY, c, dt);

  sweepThroughDamage(ctx, prevAngle, currAngle);

  if (u.sweepPhase >= 1) {
    u.cooldown = t.fireRate;
    u.sweepPhase = 0;
    sweepHitMap.delete(ctx.ui);
  }
}

function handleFocusBeam(ctx: CombatContext) {
  const { u, ui, c, t, dt, vd } = ctx;
  if (u.target === NO_UNIT) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    return;
  }

  u.beamOn = Math.min(u.beamOn + dt * 0.8, 2);

  if (u.cooldown <= 0) {
    u.cooldown = t.fireRate;
    let dmg = t.damage * u.beamOn * vd;
    if (o.shieldLingerTimer > 0) dmg *= REFLECTOR_BEAM_SHIELD_MULTIPLIER;
    o.hp -= dmg;
    o.hitFlash = 1;
    knockback(u.target, u.x, u.y, dmg * 5);
    const pCount = 1 + Math.floor(u.beamOn * 2);
    const pSize = 2 + u.beamOn * 0.5;
    const pSpeed = 50 + u.beamOn * 25;
    for (let i = 0; i < pCount; i++) {
      spawnParticle(
        o.x + (ctx.rng() - 0.5) * 8,
        o.y + (ctx.rng() - 0.5) * 8,
        (ctx.rng() - 0.5) * pSpeed,
        (ctx.rng() - 0.5) * pSpeed,
        0.08,
        pSize,
        c[0],
        c[1],
        c[2],
        SH_CIRCLE,
      );
    }
    if (o.hp <= 0) {
      killUnit(u.target);
      explosion(o.x, o.y, o.team, o.type, ui, ctx.rng);
      u.beamOn = 0;
    }
  }

  const bw = 2 + u.beamOn * 2;
  const brightness = Math.min(1, 0.5 + u.beamOn * 0.25);
  addBeam(
    u.x + Math.cos(u.angle) * t.size * 0.5,
    u.y + Math.sin(u.angle) * t.size * 0.5,
    o.x,
    o.y,
    c[0] * brightness,
    c[1] * brightness,
    c[2] * brightness,
    0.08,
    bw,
  );
}

function swarmDmgMul(u: Unit): number {
  return 1 + u.swarmN * 0.15;
}

function fireBurst(ctx: CombatContext, ang: number, d: number, sp: number, dmgMul = 1) {
  const { u, c, t, vd } = ctx;
  if (u.burstCount <= 0) u.burstCount = t.burst ?? 1;
  const sizeMul = 1 + (dmgMul - 1) * 0.5;
  const wb = (dmgMul - 1) * 0.4;
  spawnProjectile(
    u.x + Math.cos(u.angle) * t.size,
    u.y + Math.sin(u.angle) * t.size,
    Math.cos(ang) * sp + u.vx * 0.3,
    Math.sin(ang) * sp + u.vy * 0.3,
    d / sp + 0.1,
    t.damage * vd * dmgMul,
    u.team,
    (1.8 + t.damage * 0.25) * sizeMul,
    c[0] + (1 - c[0]) * wb,
    c[1] + (1 - c[1]) * wb,
    c[2] + (1 - c[2]) * wb,
  );
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
  spawnMuzzleFlash(ctx, ang);
}

const HOMING_SPREAD = 0.15;
const HOMING_SPEED = 280;

function fireHomingBurst(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, c, t, vd } = ctx;
  const burst = t.burst ?? 1;
  if (u.burstCount <= 0) u.burstCount = burst;
  const burstIdx = burst - u.burstCount;
  const spreadAng = ang + (burstIdx - (burst - 1) / 2) * HOMING_SPREAD;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(spreadAng) * sp,
    Math.sin(spreadAng) * sp,
    d / sp + 1,
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
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
  spawnMuzzleFlash(ctx, ang);
}

function fireAoe(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(ang) * sp,
    Math.sin(ang) * sp,
    d / sp + 0.2,
    t.damage * vd,
    u.team,
    AOE_PROJ_SIZE,
    c[0] * 0.8,
    c[1] * 0.7 + 0.3,
    c[2],
    false,
    t.aoe,
  );
  spawnMuzzleFlash(ctx, ang);
}

const CARPET_SPREAD = 0.2;

function fireCarpetBomb(ctx: CombatContext, ang: number, d: number, sp: number) {
  const { u, t } = ctx;
  const carpet = t.carpet ?? 1;
  if (u.burstCount <= 0) u.burstCount = carpet;
  const burstIdx = carpet - u.burstCount;
  const spreadAng = ang + (burstIdx - (carpet - 1) / 2) * CARPET_SPREAD;
  fireAoe(ctx, spreadAng, d, sp);
  u.burstCount--;
  u.cooldown = u.burstCount > 0 ? BURST_INTERVAL : t.fireRate;
}

// localX = forward, localY = starboard
const _fwBuf: [number, number] = [0, 0];
function flagshipWorld(u: Unit, localX: number, localY: number): [number, number] {
  const cos = Math.cos(u.angle);
  const sin = Math.sin(u.angle);
  _fwBuf[0] = u.x + cos * localX - sin * localY;
  _fwBuf[1] = u.y + sin * localX + cos * localY;
  return _fwBuf;
}

const MUZZLE_FWD = 0.65;

function flagshipChargeVfx(ctx: CombatContext, progress: number) {
  const { u, c, t } = ctx;
  const glowSize = 8 + progress * 22;
  const br = 0.3 + progress * 0.7;
  if (ctx.rng() < 0.4) {
    spawnParticle(u.x, u.y, 0, 0, 0.08, glowSize, c[0] * br, c[1] * br, c[2] * br, SH_EXPLOSION_RING);
  }

  for (const sign of [-1, 1] as const) {
    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      if (ctx.rng() < progress * 0.6) {
        const [ex, eyy] = flagshipWorld(u, -t.size * 1.05, sign * ey * t.size);
        const speed = 90 + ctx.rng() * 70;
        spawnParticle(
          ex,
          eyy,
          ((u.x - ex) / t.size) * speed,
          ((u.y - eyy) / t.size) * speed,
          0.1 + ctx.rng() * 0.05,
          1.5 + ctx.rng() * 2,
          c[0] * 0.7 + 0.3,
          c[1] * 0.7 + 0.3,
          c[2] * 0.7 + 0.3,
          SH_CIRCLE,
        );
      }
    }
  }

  addShake(0.4 * progress * ctx.dt * REF_FPS);
}

function flagshipPreviewBeam(ctx: CombatContext, lockAngle: number, progress: number) {
  const { u, c, t } = ctx;
  const dx = Math.cos(lockAngle);
  const dy = Math.sin(lockAngle);
  const beamLen = t.range * 0.5;
  const w = 1.0 + 2.5 * progress;
  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * beamLen, my + dy * beamLen, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.05, w, true, 8);
  }
  if (progress > 0.3) {
    const [lx, ly] = flagshipWorld(u, t.size * 0.2, 0.24 * t.size);
    const [rx, ry] = flagshipWorld(u, t.size * 0.2, -0.24 * t.size);
    addBeam(lx, ly, rx, ry, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.04, 0.5 + 1.5 * progress, undefined, 6, true);
  }
}

function flagshipFireMain(ctx: CombatContext, lockAngle: number) {
  const { u, c, t, vd } = ctx;
  const sp = FLAGSHIP_MAIN_GUN_SPEED;
  const dx = Math.cos(lockAngle);
  const dy = Math.sin(lockAngle);

  // non-homing lock ±0.15 → weak vs swarms (intentional)
  for (let i = -1; i <= 1; i++) {
    const ba = lockAngle + i * 0.15;
    const hullSign = i >= 0 ? 1 : -1;
    const [ox, oy] = flagshipWorld(u, t.size * MUZZLE_FWD, hullSign * 0.24 * t.size);
    spawnProjectile(
      ox,
      oy,
      Math.cos(ba) * sp,
      Math.sin(ba) * sp,
      t.range / sp + 0.1,
      t.damage * vd,
      u.team,
      7,
      c[0],
      c[1],
      c[2],
      false,
      60,
    );
    for (let j = 0; j < 5; j++) {
      const a = ba + (ctx.rng() - 0.5) * 0.5;
      spawnParticle(
        ox,
        oy,
        Math.cos(a) * (90 + ctx.rng() * 100),
        Math.sin(a) * (90 + ctx.rng() * 100),
        0.07 + ctx.rng() * 0.04,
        3 + ctx.rng() * 3,
        c[0] * 0.5 + 0.5,
        c[1] * 0.5 + 0.5,
        c[2] * 0.5 + 0.5,
        SH_CIRCLE,
      );
    }
  }

  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * 100, my + dy * 100, 0.95, 0.95, 1.0, 0.04, 5.5, true, 4, true);
  }

  const backX = -Math.cos(u.angle);
  const backY = -Math.sin(u.angle);
  for (const sign of [-1, 1] as const) {
    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      const [ex, eyy] = flagshipWorld(u, -t.size * 1.05, sign * ey * t.size);
      for (let j = 0; j < 2; j++) {
        spawnParticle(
          ex,
          eyy,
          backX * (120 + ctx.rng() * 80) + (ctx.rng() - 0.5) * 40,
          backY * (120 + ctx.rng() * 80) + (ctx.rng() - 0.5) * 40,
          0.06 + ctx.rng() * 0.04,
          2 + ctx.rng() * 2,
          c[0] * 0.6 + 0.4,
          c[1] * 0.6 + 0.4,
          c[2] * 0.6 + 0.4,
          SH_CIRCLE,
        );
      }
    }
  }

  spawnParticle(u.x, u.y, 0, 0, 0.1, t.size * 0.8, 1, 1, 1, SH_EXPLOSION_RING);
  for (const sign of [-1, 1] as const) {
    const [mx, my] = flagshipWorld(u, t.size * MUZZLE_FWD, sign * 0.24 * t.size);
    addBeam(mx, my, mx + dx * 240, my + dy * 240, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.06, 2.5, true, 8);
  }

  addShake(6);
}

function flagshipFireBroadside(ctx: CombatContext, lockAngle: number) {
  const { u, c, t, vd } = ctx;
  const sp = 350;
  const perpDmg = Math.ceil(t.damage * 0.6 * vd);

  for (const side of [-1, 1] as const) {
    const ba = lockAngle + side * (Math.PI / 2);
    const baDx = Math.cos(ba);
    const baDy = Math.sin(ba);
    const [ox, oy] = flagshipWorld(u, 0, side * 0.24 * t.size);
    spawnProjectile(
      ox,
      oy,
      baDx * sp,
      baDy * sp,
      (t.range * 0.7) / sp + 0.1,
      perpDmg,
      u.team,
      5,
      c[0] * 0.8,
      c[1] * 0.8,
      c[2] * 0.8,
    );

    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      const [bx, by] = flagshipWorld(u, -t.size * 0.3, side * ey * t.size);
      addBeam(bx, by, bx + baDx * 70, by + baDy * 70, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.04, 2.0, true, 6);
    }

    for (let j = 0; j < 4; j++) {
      const a = ba + (ctx.rng() - 0.5) * 0.4;
      spawnParticle(
        ox,
        oy,
        Math.cos(a) * (70 + ctx.rng() * 70),
        Math.sin(a) * (70 + ctx.rng() * 70),
        0.06 + ctx.rng() * 0.03,
        2 + ctx.rng() * 2,
        c[0],
        c[1],
        c[2],
        SH_CIRCLE,
      );
    }

    addBeam(ox, oy, ox + baDx * t.range * 0.5, oy + baDy * t.range * 0.5, c[0], c[1], c[2], 0.06, 4.0, true, 6);
  }

  addShake(4);
}

/**
 * State machine reusing existing Unit fields:
 *   beamOn: charge progress (0=idle, 0→1=charging, 1=charged)
 *   sweepBaseAngle: locked target angle at charge start
 *   broadsidePhase: phase (BROADSIDE_PHASE_CHARGE=0, BROADSIDE_PHASE_FIRE=-1)
 */
function handleFlagshipBarrage(ctx: CombatContext) {
  const { u, t, dt } = ctx;

  if (u.target === NO_UNIT) {
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_PHASE_CHARGE;
    return;
  }
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_PHASE_CHARGE;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.beamOn = Math.max(0, u.beamOn - dt * 3);
    u.broadsidePhase = BROADSIDE_PHASE_CHARGE;
    return;
  }

  // cooldown wait
  if (u.beamOn === 0 && u.cooldown > 0) return;

  // Charge phase: lock angle, build up
  if (u.beamOn === 0) {
    const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, FLAGSHIP_MAIN_GUN_SPEED, t.leadAccuracy);
    u.sweepBaseAngle = aim.ang;
    u.beamOn = 0.001;
    u.broadsidePhase = BROADSIDE_PHASE_CHARGE;
  }

  if (u.broadsidePhase === BROADSIDE_PHASE_CHARGE) {
    u.beamOn = Math.min(u.beamOn + dt / FLAGSHIP_CHARGE_TIME, 1);
    flagshipChargeVfx(ctx, u.beamOn);
    flagshipPreviewBeam(ctx, u.sweepBaseAngle, u.beamOn);

    if (u.beamOn >= 1) {
      flagshipFireMain(ctx, u.sweepBaseAngle);
      u.broadsidePhase = BROADSIDE_PHASE_FIRE;
      u.beamOn = 1;
      u.cooldown = FLAGSHIP_BROADSIDE_DELAY;
      return;
    }
    return;
  }

  // Broadside phase: fire perpendicular shots after short delay
  if (u.broadsidePhase === BROADSIDE_PHASE_FIRE && u.cooldown <= 0) {
    flagshipFireBroadside(ctx, u.sweepBaseAngle);
    u.cooldown = t.fireRate;
    u.beamOn = 0;
    u.broadsidePhase = BROADSIDE_PHASE_CHARGE;
  }
}

function fireRailgun(ctx: CombatContext, ang: number, sp: number) {
  const { u, c, t, vd } = ctx;
  u.cooldown = t.fireRate;
  spawnProjectile(
    u.x + Math.cos(ang) * t.size,
    u.y + Math.sin(ang) * t.size,
    Math.cos(ang) * sp,
    Math.sin(ang) * sp,
    t.range / sp + 0.05,
    t.damage * vd,
    u.team,
    3,
    c[0] * 0.5 + 0.5,
    c[1] * 0.5 + 0.5,
    c[2] * 0.5 + 0.5,
    false,
    0,
    undefined,
    0.6,
    ctx.ui,
  );
  addBeam(u.x, u.y, u.x + Math.cos(ang) * t.range, u.y + Math.sin(ang) * t.range, c[0], c[1], c[2], 0.1, 1.5);
  for (let i = 0; i < 4; i++) {
    const a2 = ang + (ctx.rng() - 0.5) * 0.4;
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
      SH_CIRCLE,
    );
  }
}

function spawnMuzzleFlash(ctx: CombatContext, ang: number) {
  const { u, c, t } = ctx;
  const mx = u.x + Math.cos(u.angle) * t.size;
  const my = u.y + Math.sin(u.angle) * t.size;
  for (let i = 0; i < 3; i++) {
    spawnParticle(
      mx,
      my,
      Math.cos(ang) * (60 + ctx.rng() * 60) + (ctx.rng() - 0.5) * 35,
      Math.sin(ang) * (60 + ctx.rng() * 60) + (ctx.rng() - 0.5) * 35,
      0.06 + ctx.rng() * 0.03,
      2.5 + ctx.rng() * 2,
      c[0],
      c[1],
      c[2],
      SH_CIRCLE,
    );
  }
  spawnParticle(mx, my, 0, 0, 0.05, 3 + t.damage * 0.5, 1, 1, 1, SH_CIRCLE);
}

function fireNormal(ctx: CombatContext) {
  const { u, t } = ctx;
  if (u.target === NO_UNIT) {
    u.burstCount = 0;
    return;
  }
  if (u.cooldown > 0) return;
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    u.burstCount = 0;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    u.burstCount = 0;
    return;
  }

  dispatchFire(ctx, o);
}

/** 射撃モード分岐 + 弾速決定 + 偏差射撃。COMBAT_FLAG_PRIORITY の末尾と一致させること */
function dispatchFire(ctx: CombatContext, o: Unit) {
  const { u, t } = ctx;

  // ── 弾速: 各fire関数と1:1対応。分岐追加時はここだけ更新すればよい ──
  let sp: number;
  if (t.carpet) sp = AOE_PROJ_SPEED;
  else if (t.homing) sp = HOMING_SPEED;
  else if (t.aoe) sp = AOE_PROJ_SPEED;
  else if (t.shape === RAILGUN_SHAPE) sp = RAILGUN_SPEED;
  else sp = 480 + t.damage * 12;

  const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, sp, t.leadAccuracy);

  if (t.carpet) {
    fireCarpetBomb(ctx, aim.ang, aim.dist, sp);
    return;
  }

  if (t.homing) {
    fireHomingBurst(ctx, aim.ang, aim.dist, sp);
    return;
  }

  if (t.burst) {
    fireBurst(ctx, aim.ang, aim.dist, sp);
    return;
  }

  if (t.aoe) {
    fireAoe(ctx, aim.ang, aim.dist, sp);
  } else if (t.shape === RAILGUN_SHAPE) {
    fireRailgun(ctx, aim.ang, sp);
  } else {
    const dmgMul = t.swarm ? swarmDmgMul(u) : 1;
    fireBurst(ctx, aim.ang, aim.dist, sp, dmgMul);
  }
}

export function combat(u: Unit, ui: UnitIndex, dt: number, _now: number, rng: () => number) {
  const t = unitType(u.type);
  if (u.stun > 0) return;
  u.cooldown -= dt;
  u.abilityCooldown -= dt;
  const c = color(u.type, u.team);
  const vd = 1 + u.vet * 0.2;
  _ctx.u = u;
  _ctx.ui = ui;
  _ctx.dt = dt;
  _ctx.c = c;
  _ctx.vd = vd;
  _ctx.t = t;
  _ctx.rng = rng;

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
  // 非排他: ブリンク非発動フレームは通常射撃にフォールスルー（blinkArrive/Depart は cooldown を設定するため二重射撃にならない）
  if (t.teleports) handleTeleporter(_ctx);
  if (t.chain && u.cooldown <= 0) {
    handleChain(_ctx);
    return;
  }
  if (t.sweep) {
    handleSweepBeam(_ctx);
    return;
  }
  if (t.broadside) {
    handleFlagshipBarrage(_ctx);
    return;
  }
  if (t.beam) {
    handleFocusBeam(_ctx);
    return;
  }
  fireNormal(_ctx);
}

const COMBAT_FLAG_PRIORITY: DemoFlag[] = [
  'rams',
  'heals',
  'reflects',
  'spawns',
  'emp',
  'teleports',
  'chain',
  'sweep',
  'broadside',
  'beam',
  'carpet',
  'homing',
  'burst',
  'swarm',
];

export function demoFlag(t: UnitType): DemoFlag | null {
  for (const flag of COMBAT_FLAG_PRIORITY) {
    if (t[flag]) return flag;
  }
  return null;
}
