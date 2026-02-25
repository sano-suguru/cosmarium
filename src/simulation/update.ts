import { swapRemove } from '../array-utils.ts';
import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { effectColor } from '../colors.ts';
import {
  AMP_BOOST_LINGER,
  PI,
  POOL_PARTICLES,
  POOL_PROJECTILES,
  POOL_UNITS,
  REF_FPS,
  REFLECT_FIELD_MAX_HP,
  SH_CIRCLE,
  SH_EXPLOSION_RING,
  TAU,
} from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { particle, poolCounts, projectile, unit } from '../pools.ts';
import type { Color3, ParticleIndex, Projectile, ProjectileIndex, Unit, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType, unitTypeIndex } from '../unit-types.ts';
import { absorbByBastionShield, applyTetherAbsorb, combat, reflectProjectile, resetReflected } from './combat.ts';
import { boostBurst, boostTrail, flagshipTrail, killUnitWithExplosion, trail, updateChains } from './effects.ts';
import { applyOnKillEffects, KILL_CONTEXT } from './on-kill-effects.ts';
import type { ReinforcementState } from './reinforcements.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighborAt, getNeighbors, knockback } from './spatial-hash.ts';
import { addTrackingBeam, killerFrom, killParticle, killProjectile, spawnParticle } from './spawn.ts';
import { steer } from './steering.ts';

export const SHIELD_LINGER = 2;
export const TETHER_BEAM_LIFE = 0.7;
const SWARM_RADIUS_SQ = 80 * 80;
const HIT_FLASH_DURATION = 0.08;
export const MAX_STEPS_PER_FRAME = 8;
export const REFLECT_FIELD_GRANT_INTERVAL = 1;
const REFLECT_FIELD_RADIUS = 100;
const BASTION_SHIELD_RADIUS = 120;
const BASTION_MAX_TETHERS = 4;
export const ORPHAN_TETHER_PROJECTILE_MULT = 0.7;

const AMP_RADIUS = 120;
const AMP_MAX_TETHERS = 4;
const AMP_TETHER_BEAM_LIFE = 0.7;

function steerHomingProjectile(p: Projectile, dt: number) {
  const tg = unit(p.target);
  if (tg.alive) {
    let ca = Math.atan2(p.vy, p.vx);
    const da = Math.atan2(tg.y - p.y, tg.x - p.x);
    let diff = da - ca;
    if (diff > PI) diff -= TAU;
    if (diff < -PI) diff += TAU;
    ca += diff * 4 * dt;
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.vx = Math.cos(ca) * sp;
    p.vy = Math.sin(ca) * sp;
  }
}

function detonateAoe(p: Projectile, rng: () => number, skipUnit?: UnitIndex) {
  const src = p.sourceUnit !== NO_UNIT ? unit(p.sourceUnit) : undefined;
  const pKiller = src?.alive ? killerFrom(p.sourceUnit) : undefined;
  const nn = getNeighbors(p.x, p.y, p.aoe);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = unit(oi);
    if (!o.alive || o.team === p.team) continue;
    if (skipUnit !== undefined && oi === skipUnit) continue;
    const ddx = o.x - p.x,
      ddy = o.y - p.y;
    if (ddx * ddx + ddy * ddy < p.aoe * p.aoe) {
      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
      o.hp -= p.damage * (1 - dd / (p.aoe * 1.2));
      o.hitFlash = 1;
      knockback(oi, p.x, p.y, 220);
      if (o.hp <= 0) {
        killUnitWithExplosion(oi, pKiller, p.sourceUnit, rng);
        applyOnKillEffects(p.sourceUnit, p.team, KILL_CONTEXT.ProjectileAoe);
      }
    }
  }
  for (let j = 0; j < 16; j++) {
    const a = rng() * 6.283;
    spawnParticle(
      p.x,
      p.y,
      Math.cos(a) * (40 + rng() * 110),
      Math.sin(a) * (40 + rng() * 110),
      0.3 + rng() * 0.3,
      3 + rng() * 3,
      p.r,
      p.g * 0.8 + 0.2,
      p.b * 0.3,
      SH_CIRCLE,
    );
  }
  spawnParticle(p.x, p.y, 0, 0, 0.4, p.aoe * 0.9, p.r, p.g * 0.7 + 0.3, p.b * 0.2, SH_EXPLOSION_RING);
  addShake(3, p.x, p.y);
}

function handleProjectileKill(p: Projectile, oi: UnitIndex, rng: () => number) {
  const src = p.sourceUnit !== NO_UNIT ? unit(p.sourceUnit) : undefined;
  killUnitWithExplosion(oi, src?.alive ? killerFrom(p.sourceUnit) : undefined, p.sourceUnit, rng);
  applyOnKillEffects(p.sourceUnit, p.team, KILL_CONTEXT.ProjectileDirect);
}

function tryReflectField(p: Projectile, o: Unit, rng: () => number): boolean {
  if (o.reflectFieldHp <= 0) return false;
  o.reflectFieldHp -= p.damage;
  if (o.reflectFieldHp <= 0) {
    o.reflectFieldHp = 0;
  }
  const c: Color3 = effectColor(o.type, o.team);
  reflectProjectile(rng, o.x, o.y, p, o.team, c);
  return true;
}

function applyProjectileDamage(p: Projectile, oi: UnitIndex, o: Unit, rng: () => number) {
  if (tryReflectField(p, o, rng)) return;
  const src = p.sourceUnit !== NO_UNIT ? unit(p.sourceUnit) : undefined;
  const pKiller = src?.alive ? killerFrom(p.sourceUnit) : undefined;
  let dmg = applyTetherAbsorb(o, p.damage, ORPHAN_TETHER_PROJECTILE_MULT, pKiller, rng);
  dmg = absorbByBastionShield(o, dmg);
  o.hp -= dmg;
  o.hitFlash = 1;
  knockback(oi, p.x, p.y, p.damage * 12);
  spawnParticle(p.x, p.y, (rng() - 0.5) * 70, (rng() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, SH_CIRCLE);
  if (o.hp <= 0) handleProjectileKill(p, oi, rng);
}

function piercingHitFx(p: Projectile, rng: () => number) {
  const pAng = Math.atan2(p.vy, p.vx);
  for (let k = 0; k < 5; k++) {
    const sA = pAng + (rng() - 0.5) * 1.75;
    const sSpd = 80 + rng() * 120;
    spawnParticle(p.x, p.y, Math.cos(sA) * sSpd, Math.sin(sA) * sSpd, 0.06 + rng() * 0.04, 1.5, 1, 1, 0.7, SH_CIRCLE);
  }
  spawnParticle(p.x, p.y, 0, 0, 0.12, 6, p.r, p.g, p.b, SH_EXPLOSION_RING);
}

function detectProjectileHit(p: Projectile, pi: ProjectileIndex, rng: () => number): boolean {
  const nn = getNeighbors(p.x, p.y, 30);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j),
      o = unit(oi);
    if (!o.alive || o.team === p.team) continue;
    if (p.piercing > 0 && oi === p.lastHitUnit) continue;
    const hs = unitType(o.type).size;
    if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) >= hs * hs) continue;
    applyProjectileDamage(p, oi, o, rng);
    if (p.piercing > 0) {
      p.damage *= p.piercing;
      p.lastHitUnit = oi;
      piercingHitFx(p, rng);
      return true;
    }
    if (p.aoe > 0) {
      detonateAoe(p, rng, oi);
    }
    killProjectile(pi);
    return true;
  }
  return false;
}

function railgunTrail(p: Projectile, dt: number, rng: () => number) {
  // Core trail: bright, backward-flowing
  if (rng() < 1 - 0.15 ** (dt * REF_FPS)) {
    const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const nx = sp > 0 ? p.vx / sp : 0;
    const ny = sp > 0 ? p.vy / sp : 0;
    spawnParticle(
      p.x,
      p.y,
      -nx * 60 + (rng() - 0.5) * 15,
      -ny * 60 + (rng() - 0.5) * 15,
      0.12,
      p.size,
      Math.min(1, p.r * 1.5),
      Math.min(1, p.g * 1.5),
      Math.min(1, p.b * 1.5),
      SH_CIRCLE,
    );
  }
  // Outer glow: dimmer, wider spread
  if (rng() < 1 - 0.5 ** (dt * REF_FPS)) {
    spawnParticle(
      p.x,
      p.y,
      (rng() - 0.5) * 30,
      (rng() - 0.5) * 30,
      0.08,
      p.size * 2,
      p.r * 0.4,
      p.g * 0.4,
      p.b * 0.4,
      SH_CIRCLE,
    );
  }
}

function projectileTrail(p: Projectile, dt: number, rng: () => number) {
  if (p.homing) {
    const prob = 1 - 0.35 ** (dt * REF_FPS);
    if (rng() < prob) {
      // Engine smoke
      spawnParticle(p.x, p.y, (rng() - 0.5) * 12, (rng() - 0.5) * 12, 0.3, 3.0, 0.5, 0.5, 0.5, SH_CIRCLE);
    }
    if (rng() < prob) {
      // Colored glow trail
      spawnParticle(
        p.x,
        p.y,
        (rng() - 0.5) * 8,
        (rng() - 0.5) * 8,
        0.15,
        p.size * 1.2,
        Math.min(1, p.r * 1.4),
        Math.min(1, p.g * 1.4),
        Math.min(1, p.b * 1.4),
        SH_CIRCLE,
      );
    }
  } else if (p.piercing > 0) {
    railgunTrail(p, dt, rng);
  } else if (rng() < 1 - 0.65 ** (dt * REF_FPS)) {
    spawnParticle(
      p.x,
      p.y,
      (rng() - 0.5) * 10,
      (rng() - 0.5) * 10,
      0.04,
      p.size * 0.5,
      p.r * 0.6,
      p.g * 0.6,
      p.b * 0.6,
      SH_CIRCLE,
    );
  }
}

function updateProjectiles(dt: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.projectiles; i < POOL_PROJECTILES && rem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) continue;
    rem--;

    if (p.homing && p.target !== NO_UNIT) steerHomingProjectile(p, dt);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    projectileTrail(p, dt, rng);

    if (p.life <= 0) {
      if (p.aoe > 0) detonateAoe(p, rng);
      killProjectile(i as ProjectileIndex);
      continue;
    }

    detectProjectileHit(p, i as ProjectileIndex, rng);
  }
}

function updateParticles(dt: number) {
  for (let i = 0, rem = poolCounts.particles; i < POOL_PARTICLES && rem > 0; i++) {
    const pp = particle(i);
    if (!pp.alive) continue;
    rem--;
    pp.x += pp.vx * dt;
    pp.y += pp.vy * dt;
    const drag = 0.97 ** (dt * REF_FPS);
    pp.vx *= drag;
    pp.vy *= drag;
    pp.life -= dt;
    if (pp.life <= 0) {
      killParticle(i as ParticleIndex);
    }
  }
}

function updateBeams(dt: number) {
  for (let i = 0; i < beams.length; ) {
    const bm = getBeam(i);
    bm.life -= dt;
    if (bm.life <= 0) {
      swapRemove(beams, i);
    } else {
      i++;
    }
  }
}

function updateTrackingBeams(dt: number) {
  for (let i = 0; i < trackingBeams.length; ) {
    const tb = getTrackingBeam(i);
    tb.life -= dt;
    const src = unit(tb.srcUnit);
    const tgt = unit(tb.tgtUnit);
    if (tb.life <= 0 || !src.alive || !tgt.alive || src.team !== tgt.team) {
      swapRemove(trackingBeams, i);
      continue;
    }
    tb.x1 = src.x;
    tb.y1 = src.y;
    tb.x2 = tgt.x;
    tb.y2 = tgt.y;
    i++;
  }
}

function countSwarmAllies(u: Unit): number {
  const nn = getNeighbors(u.x, u.y, 80);
  let allies = 0;
  for (let j = 0; j < nn; j++) {
    const o = unit(getNeighborAt(j));
    if (o === u || !o.alive || o.team !== u.team || o.type !== u.type) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    if (dx * dx + dy * dy < SWARM_RADIUS_SQ) allies++;
  }
  return Math.min(allies, 6);
}

export function updateSwarmN() {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (!unitType(u.type).swarm) {
      u.swarmN = 0;
      continue;
    }
    u.swarmN = countSwarmAllies(u);
  }
}

const FLAGSHIP = unitTypeIndex('Flagship');

function emitTrail(u: Unit, rng: () => number) {
  if (u.type === FLAGSHIP) flagshipTrail(u, rng);
  else trail(u, rng);
}

function updateUnits(dt: number, now: number, rng: () => number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const prevHp = u.hp;
    const wasNotBoosting = u.boostTimer <= 0;
    steer(u, dt, rng);
    combat(u, i as UnitIndex, dt, now, rng);
    if (u.alive && u.hp < prevHp) u.hitFlash = 1;
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + rng() * 0.02;
      emitTrail(u, rng);
    }
    if (u.boostTimer > 0 && u.stun <= 0) {
      boostTrail(u, dt, rng);
      if (wasNotBoosting) boostBurst(u, rng);
    }
  }
}

function tickReflectorShield(u: Unit, dt: number) {
  if (u.shieldCooldown <= 0) return;
  u.shieldCooldown -= dt;
  if (u.shieldCooldown <= 0) {
    u.shieldCooldown = 0;
    u.energy = u.maxEnergy;
  }
}

/** エネルギー自然回復（stun 中も回復する）。Reflectorはシールドクールダウン→全回復制 */
function regenEnergy(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.maxEnergy <= 0) continue;
    const t = unitType(u.type);
    if (t.reflects) {
      tickReflectorShield(u, dt);
    } else {
      const regen = t.energyRegen ?? 0;
      u.energy = Math.min(u.maxEnergy, u.energy + regen * dt);
    }
  }
}

function decayHitFlash(dt: number) {
  const decay = dt / HIT_FLASH_DURATION;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - decay);
  }
}

function decayShieldTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.shieldLingerTimer > 0) u.shieldLingerTimer = Math.max(0, u.shieldLingerTimer - dt);
  }
}

function applyReflectorAllyField(u: Unit, i: number, dt: number) {
  if (u.maxEnergy <= 0) return;
  if (u.fieldGrantCooldown > 0) {
    u.fieldGrantCooldown = Math.max(0, u.fieldGrantCooldown - dt);
    return;
  }
  let granted = false;
  const nn = getNeighbors(u.x, u.y, REFLECT_FIELD_RADIUS);
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i || unitType(o.type).reflects) continue;
    if (o.reflectFieldHp <= 0) {
      o.reflectFieldHp = REFLECT_FIELD_MAX_HP;
      granted = true;
    }
  }
  if (granted) {
    u.fieldGrantCooldown = REFLECT_FIELD_GRANT_INTERVAL;
  }
}

function refreshTetherBeam(src: UnitIndex, tgt: UnitIndex): boolean {
  for (let i = 0; i < trackingBeams.length; i++) {
    const tb = getTrackingBeam(i);
    if (tb.srcUnit === src && tb.tgtUnit === tgt) {
      tb.life = tb.maxLife;
      return true;
    }
  }
  return false;
}

// tetherNearbyAllies 用ソート済みバッファ — サイズは BASTION_MAX_TETHERS に結合。
// 複数 Bastion が存在しても applyShieldsAndFields 内の逐次ループで呼ばれるため同時使用は起きない。
const _tetherOi = new Int32Array(BASTION_MAX_TETHERS);
const _tetherDist = new Float64Array(BASTION_MAX_TETHERS);

/** 固定サイズ (BASTION_MAX_TETHERS=4) のため挿入ソートで十分 */
function tetherBubbleInsert(start: number, oi: number, d: number) {
  let p = start;
  while (p > 0 && (_tetherDist[p - 1] ?? 0) > d) {
    _tetherOi[p] = _tetherOi[p - 1] ?? 0;
    _tetherDist[p] = _tetherDist[p - 1] ?? 0;
    p--;
  }
  _tetherOi[p] = oi;
  _tetherDist[p] = d;
}

function tetherNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, BASTION_SHIELD_RADIUS);
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (count < BASTION_MAX_TETHERS) {
      tetherBubbleInsert(count, oi, d);
      count++;
    } else if (d < (_tetherDist[count - 1] ?? 0)) {
      tetherBubbleInsert(count - 1, oi, d);
    }
  }
  for (let j = 0; j < count; j++) {
    const oi = (_tetherOi[j] ?? 0) as UnitIndex;
    const o = unit(oi);
    if (!refreshTetherBeam(i as UnitIndex, oi)) {
      addTrackingBeam(i as UnitIndex, oi, 0.3, 0.6, 1.0, TETHER_BEAM_LIFE, 1.5);
    }
    o.shieldLingerTimer = SHIELD_LINGER;
    o.shieldSourceUnit = i as UnitIndex;
  }
}

// amplifyNearbyAllies 用ソート済みバッファ — tetherNearbyAllies とは独立。
const _ampOi = new Int32Array(AMP_MAX_TETHERS);
const _ampDist = new Float64Array(AMP_MAX_TETHERS);

function ampBubbleInsert(start: number, oi: number, d: number) {
  let p = start;
  while (p > 0 && (_ampDist[p - 1] ?? 0) > d) {
    _ampOi[p] = _ampOi[p - 1] ?? 0;
    _ampDist[p] = _ampDist[p - 1] ?? 0;
    p--;
  }
  _ampOi[p] = oi;
  _ampDist[p] = d;
}

function amplifyNearbyAllies(u: Unit, i: number) {
  const nn = getNeighbors(u.x, u.y, AMP_RADIUS);
  let count = 0;
  for (let j = 0; j < nn; j++) {
    const oi = getNeighborAt(j);
    const o = unit(oi);
    if (!o.alive || o.team !== u.team || oi === i) continue;
    if (unitType(o.type).amplifies) continue;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = dx * dx + dy * dy;
    if (count < AMP_MAX_TETHERS) {
      ampBubbleInsert(count, oi, d);
      count++;
    } else if (d < (_ampDist[count - 1] ?? 0)) {
      ampBubbleInsert(count - 1, oi, d);
    }
  }
  for (let j = 0; j < count; j++) {
    const oi = (_ampOi[j] ?? 0) as UnitIndex;
    const o = unit(oi);
    if (!refreshTetherBeam(i as UnitIndex, oi)) {
      addTrackingBeam(i as UnitIndex, oi, 1.0, 0.6, 0.15, AMP_TETHER_BEAM_LIFE, 1.5);
    }
    o.ampBoostTimer = AMP_BOOST_LINGER;
  }
}

function decayAmpTimers(dt: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.ampBoostTimer > 0) u.ampBoostTimer = Math.max(0, u.ampBoostTimer - dt);
  }
}

function applyShieldsAndFields(dt: number) {
  decayShieldTimers(dt);
  decayAmpTimers(dt);
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const t = unitType(u.type);
    if (t.reflects) applyReflectorAllyField(u, i, dt);
    if (t.shields) tetherNearbyAllies(u, i);
    if (t.amplifies) amplifyNearbyAllies(u, i);
  }
}

export interface GameLoopState extends ReinforcementState {
  codexOpen: boolean;
  updateCodexDemo: (dt: number) => void;
}

function stepOnce(dt: number, now: number, rng: () => number, gameState: GameLoopState) {
  const co = gameState.codexOpen;
  decayHitFlash(dt);
  buildHash();
  updateSwarmN();
  resetReflected();

  updateUnits(dt, now, rng);
  regenEnergy(dt);

  applyShieldsAndFields(dt);

  updateProjectiles(dt, rng);
  updateParticles(dt);
  updateBeams(dt);
  updateChains(dt, rng);
  updateTrackingBeams(dt);

  if (!co) {
    reinforce(dt, rng, gameState);
  } else {
    gameState.updateCodexDemo(dt);
  }
}

export function update(rawDt: number, now: number, rng: () => number, gameState: GameLoopState) {
  const maxStep = 1 / REF_FPS;
  if (rawDt <= maxStep) {
    stepOnce(rawDt, now, rng, gameState);
  } else {
    const steps = Math.min(Math.ceil(rawDt / maxStep), MAX_STEPS_PER_FRAME);
    const dt = rawDt / steps;
    for (let s = 0; s < steps; s++) {
      stepOnce(dt, now, rng, gameState);
    }
  }
}
