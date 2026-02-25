import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { color } from '../colors.ts';
import {
  POOL_PARTICLES,
  POOL_PROJECTILES,
  POOL_UNITS,
  REFLECT_FIELD_MAX_HP,
  SH_CIRCLE,
  SH_DIAMOND,
  SH_EXPLOSION_RING,
  TAU,
  WORLD_SIZE,
} from '../constants.ts';
import { particle, poolCounts, projectile, unit } from '../pools.ts';
import type { Beam, Unit, UnitType } from '../types.ts';
import { devWarn } from '../ui/dev-overlay.ts';
import { unitType } from '../unit-types.ts';
import { instanceData, MAX_INSTANCES, writeSlots } from './buffers.ts';

const SH_BEAM = 12;
const SH_HOMING = 14;
const SH_BAR = 21;
const SH_OCT_SHIELD = 22;
const SH_LIGHTNING = 23;
const SH_REFLECT_FIELD = 27;
// TAU multiple keeps sin(now*N) continuous at wrap boundary; ×10000 ≈ 17.5h before reset
export const WRAP_PERIOD = TAU * 10000;

const _writer = { idx: 0, overflowWarned: false };

function writeInstance(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number,
) {
  if (_writer.idx < MAX_INSTANCES) {
    writeSlots(instanceData, _writer.idx * 9, x, y, size, r, g, b, a, angle, shape);
    _writer.idx++;
  } else if (!_writer.overflowWarned) {
    devWarn(`writeInstance: idx(${_writer.idx}) >= MAX_INSTANCES(${MAX_INSTANCES}), drawing skipped`);
    _writer.overflowWarned = true;
  }
}

function writeOverlay(x: number, y: number, size: number, r: number, g: number, b: number, a: number, shape: number) {
  writeInstance(x, y, size, r, g, b, a, 0, shape);
}

function writeParticle(x: number, y: number, size: number, r: number, g: number, b: number, a: number, shape: number) {
  writeInstance(x, y, size, r, g, b, a, 0, shape);
}

function writeBeam(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number = SH_BEAM,
) {
  writeInstance(x, y, size, r, g, b, a, angle, shape);
}

/** Minimum world-size for rendering so small-unit SDF details stay visible. */
const MIN_RENDER_SIZE = 10;

// 最大距離 = WORLD_SIZE*2*sqrt(2), ステップ幅8px
const MAX_LIGHTNING_STEPS = ((WORLD_SIZE * 2 * Math.SQRT2) / 8) | 0;
const _lightningPts = new Float64Array((MAX_LIGHTNING_STEPS + 1) * 2);

function renderStunStars(u: Unit, ut: UnitType, now: number, rs: number) {
  if (u.stun > 0) {
    for (let j = 0; j < 2; j++) {
      const sa = now * 5 + j * 3.14;
      writeInstance(
        u.x + Math.cos(sa) * ut.size * 0.7 * rs,
        u.y + Math.sin(sa) * ut.size * 0.7 * rs,
        2 * rs,
        0.5,
        0.5,
        1,
        0.5,
        0,
        SH_CIRCLE,
      );
    }
  }
}

function renderHpBar(u: Unit, ut: UnitType, rs: number) {
  const hr = u.hp / u.maxHp;
  if (hr < 1) {
    const bw = ut.size * 1.5 * rs;
    const barY = u.y - ut.size * 1.3 * rs;
    writeInstance(u.x, barY, bw * 0.5, 0.04, 0.05, 0.08, 0.35, 0, SH_BAR);
    const hpW = bw * hr;
    const hpB = Math.max(0, (hr - 0.5) * 1.4);
    writeInstance(u.x - (bw - hpW) * 0.5, barY, hpW * 0.5, 1 - hr, hr, hpB, 0.75, 0, SH_BAR);
  }
}

function renderShieldOverlay(u: Unit, ut: UnitType, now: number, rs: number) {
  if (ut.shields && u.maxEnergy > 0 && u.energy > 0) {
    const alpha = 0.15 + (u.energy / u.maxEnergy) * 0.25;
    writeInstance(u.x, u.y, ut.size * 1.5 * rs, 0.3, 0.6, 1, alpha, (now * 0.8) % TAU, SH_OCT_SHIELD);
  }

  if (u.shieldLingerTimer > 0)
    writeInstance(u.x, u.y, ut.size * 1.8 * rs, 0.3, 0.6, 1, 0.5, (now * 0.5) % TAU, SH_OCT_SHIELD);
  if (u.reflectFieldHp > 0 && !ut.reflects) {
    const hpRatio = u.reflectFieldHp / REFLECT_FIELD_MAX_HP;
    writeInstance(
      u.x,
      u.y,
      ut.size * 1.6 * rs,
      0.7,
      0.5,
      1.0,
      0.12 + hpRatio * 0.18,
      (now * 1.2) % TAU,
      SH_REFLECT_FIELD,
    );
  }
  if (ut.reflects && u.maxEnergy > 0) {
    if (u.shieldCooldown > 0) {
      const blink = Math.sin(now * 8) * 0.5 + 0.5;
      writeInstance(
        u.x,
        u.y,
        ut.size * 1.6 * rs,
        1.0,
        0.2,
        0.2,
        0.1 + blink * 0.15,
        (now * 1.2) % TAU,
        SH_REFLECT_FIELD,
      );
    } else if (u.energy > 0) {
      const energyRatio = u.energy / u.maxEnergy;
      const baseAlpha = energyRatio * 0.2;
      writeInstance(u.x, u.y, ut.size * 1.6 * rs, 0.7, 0.5, 1.0, baseAlpha, (now * 1.2) % TAU, SH_REFLECT_FIELD);
    }
  }
}

function renderUnits(now: number) {
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.blinkPhase === 1) continue;
    const ut = unitType(u.type);
    const rs = Math.max(MIN_RENDER_SIZE, ut.size) / ut.size;
    const c = color(u.type, u.team);
    const hr = u.hp / u.maxHp;
    const flash = hr < 0.3 ? Math.sin(now * 15) * 0.3 + 0.7 : 1;
    const sf = u.stun > 0 ? Math.sin(now * 25) * 0.3 + 0.5 : 1;

    renderShieldOverlay(u, ut, now, rs);
    renderStunStars(u, ut, now, rs);
    if (u.vet > 0) {
      const pulse = 1 + Math.sin(now * 4) * 0.1;
      const vetSize = ut.size * (1.4 + u.vet * 0.3) * rs * pulse;
      const vetAlpha = 0.1 + u.vet * 0.08;
      writeOverlay(u.x, u.y, vetSize, 1, 0.9, 0.3, vetAlpha, SH_EXPLOSION_RING);
    }
    if (u.swarmN > 0)
      writeOverlay(u.x, u.y, ut.size * 2.2 * rs, c[0], c[1], c[2], 0.06 + u.swarmN * 0.03, SH_EXPLOSION_RING);
    const vetTint = u.vet * 0.15; // vet上限=2 (effects.ts) → max 0.3、クランプ不要
    const vr0 = (c[0] + (1 - c[0]) * vetTint) * flash * sf;
    const vg0 = (c[1] + (0.9 - c[1]) * vetTint) * flash * sf;
    const vb0 = (c[2] + (0.3 - c[2]) * vetTint) * flash * sf;
    const hf = u.hitFlash;
    const vr = vr0 + (1 - vr0) * hf;
    const vg = vg0 + (1 - vg0) * hf;
    const vb = vb0 + (1 - vb0) * hf;
    writeInstance(u.x, u.y, ut.size * rs, vr, vg, vb, 0.9, u.angle, ut.shape);
    renderHpBar(u, ut, rs);
  }
}

function renderParticles() {
  for (let i = 0, rem = poolCounts.particles; i < POOL_PARTICLES && rem > 0; i++) {
    const p = particle(i);
    if (!p.alive) continue;
    rem--;
    const al = Math.min(1, p.life / p.maxLife);
    let size = p.size * (0.5 + al * 0.5);
    const shape = p.shape;
    if (shape === SH_EXPLOSION_RING) size = p.size * (2.2 - al * 1.7);
    writeParticle(p.x, p.y, size, p.r * al, p.g * al, p.b * al, al * 0.8, shape);
  }
}

function computeTaperScale(tail: number): number {
  if (tail === 0) return 0.25;
  if (tail === 1) return 0.5;
  if (tail === 2) return 0.8;
  return 1;
}

function renderLightningBeam(bm: Beam, now: number, al: number, dx: number, dy: number, d: number, ang: number) {
  const lSteps = Math.min(MAX_LIGHTNING_STEPS, Math.max(3, (d / 8) | 0));
  const perpX = -Math.sin(ang),
    perpY = Math.cos(ang);
  let ptsLen = 0;
  for (let j = 0; j <= lSteps; j++) {
    const t = j / lSteps;
    let off = 0;
    if (j > 0 && j < lSteps) {
      const h = Math.sin(j * 127.1 + now * 40) * 43758.5;
      const rnd = h - Math.floor(h);
      off = (rnd * 2 - 1) * bm.width * 4;
    }
    _lightningPts[ptsLen++] = bm.x1 + dx * t + perpX * off;
    _lightningPts[ptsLen++] = bm.y1 + dy * t + perpY * off;
  }
  for (let j = 0; j < lSteps; j++) {
    const x0 = _lightningPts[j * 2] as number,
      y0 = _lightningPts[j * 2 + 1] as number;
    const x1 = _lightningPts[j * 2 + 2] as number,
      y1 = _lightningPts[j * 2 + 3] as number;
    const mx = (x0 + x1) * 0.5,
      my = (y0 + y1) * 0.5;
    const segDx = x1 - x0,
      segDy = y1 - y0;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    const segAng = Math.atan2(segDy, segDx);
    const fl = 0.8 + Math.sin(j * 5.0 + now * 55) * 0.2;
    const white = 0.5 + al * 0.5;
    writeBeam(
      mx,
      my,
      segLen * 0.6,
      (bm.r * 0.4 + white * 0.6) * al * fl,
      (bm.g * 0.4 + white * 0.6) * al * fl,
      (bm.b * 0.4 + white * 0.6) * al * fl,
      al * 0.9,
      segAng,
      SH_LIGHTNING,
    );
  }
}

function renderTrackingBeams(now: number) {
  for (let i = 0; i < trackingBeams.length; i++) {
    const tb = getTrackingBeam(i);
    const al = tb.life / tb.maxLife;
    const dx = tb.x2 - tb.x1,
      dy = tb.y2 - tb.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(3, (d / 5) | 0);
    const ang = Math.atan2(dy, dx);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const fl = 0.7 + Math.sin(j * 2.5 + now * 35) * 0.3;
      writeBeam(
        tb.x1 + dx * t,
        tb.y1 + dy * t,
        tb.width * (1 + Math.sin(j * 0.6 + now * 25) * 0.25),
        tb.r * al * fl,
        tb.g * al * fl,
        tb.b * al * fl,
        al * 0.85,
        ang,
      );
    }
  }
}

function renderBeams(now: number) {
  for (let i = 0; i < beams.length; i++) {
    const bm = getBeam(i);
    const al = bm.life / bm.maxLife;
    const dx = bm.x2 - bm.x1,
      dy = bm.y2 - bm.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const divisor = bm.stepDiv ?? 1;
    const steps = Math.max(3, (d / (5 * divisor)) | 0);
    const ang = Math.atan2(dy, dx);
    if (bm.lightning) {
      renderLightningBeam(bm, now, al, dx, dy, d, ang);
    } else {
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const fl = 0.7 + Math.sin(j * 2.5 + now * 35) * 0.3;
        const tipScale = bm.tapered ? computeTaperScale(steps - j) : 1;
        writeBeam(
          bm.x1 + dx * t,
          bm.y1 + dy * t,
          bm.width * (1 + Math.sin(j * 0.6 + now * 25) * 0.25) * tipScale,
          bm.r * al * fl,
          bm.g * al * fl,
          bm.b * al * fl,
          al * 0.85,
          ang,
        );
      }
    }
  }
  renderTrackingBeams(now);
}

function renderProjectiles() {
  for (let i = 0, rem = poolCounts.projectiles; i < POOL_PROJECTILES && rem > 0; i++) {
    const pr = projectile(i);
    if (!pr.alive) continue;
    rem--;
    let shape: number;
    if (pr.homing) shape = SH_HOMING;
    else if (pr.aoe > 0) shape = SH_CIRCLE;
    else shape = SH_DIAMOND;
    writeInstance(pr.x, pr.y, pr.size, pr.r, pr.g, pr.b, 1, Math.atan2(pr.vy, pr.vx), shape);
  }
}

export function renderScene(now: number): number {
  _writer.idx = 0;
  const t = now % WRAP_PERIOD;

  renderParticles();
  renderBeams(t);
  renderProjectiles();
  renderUnits(t);

  return _writer.idx;
}
