import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { getColor } from '../colors.ts';
import {
  MAX_INSTANCES,
  POOL_PARTICLES,
  POOL_PROJECTILES,
  POOL_UNITS,
  SH_BAR,
  SH_BEAM,
  SH_CIRCLE,
  SH_DIAMOND,
  SH_EXPLOSION_RING,
  SH_HOMING,
  SH_LIGHTNING,
  SH_OCT_SHIELD,
  SH_STAR,
  TAU,
} from '../constants.ts';
import { getParticle, getProjectile, getUnit } from '../pools.ts';
import type { Unit, UnitType } from '../types.ts';
import { devWarn } from '../ui/dev-overlay.ts';
import { getUnitType } from '../unit-types.ts';
import { instanceData, writeSlots } from './buffers.ts';

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

function writeBeamSegment(
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

function renderStunStars(u: Unit, ut: UnitType, now: number) {
  if (u.stun > 0) {
    for (let j = 0; j < 2; j++) {
      const sa = now * 5 + j * 3.14;
      writeInstance(
        u.x + Math.cos(sa) * ut.size * 0.7,
        u.y + Math.sin(sa) * ut.size * 0.7,
        2,
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

function renderHpBar(u: Unit, ut: UnitType) {
  const hr = u.hp / u.maxHp;
  if (ut.size >= 10 && hr < 1) {
    const bw = ut.size * 1.5;
    const barY = u.y - ut.size * 1.3;
    writeInstance(u.x, barY, bw * 0.5, 0.04, 0.05, 0.08, 0.35, 0, SH_BAR);
    const hpW = bw * hr;
    const hpB = Math.max(0, (hr - 0.5) * 1.4);
    writeInstance(u.x - (bw - hpW) * 0.5, barY, hpW * 0.5, 1 - hr, hr, hpB, 0.75, 0, SH_BAR);
  }
}

function renderVetBadges(u: Unit, ut: UnitType, now: number) {
  if (u.vet >= 1)
    writeInstance(
      u.x + ut.size * 1.1,
      u.y - ut.size * 1.1,
      /*size*/ 2,
      /*r*/ 1,
      /*g*/ 1,
      /*b*/ 0.3,
      /*a*/ 0.8,
      now * 3,
      /*shape*/ SH_STAR,
    );
  if (u.vet >= 2)
    writeInstance(
      u.x + ut.size * 1.1 + 5,
      u.y - ut.size * 1.1,
      /*size*/ 2,
      /*r*/ 1,
      /*g*/ 0.5,
      /*b*/ 0.3,
      /*a*/ 0.8,
      now * 3,
      /*shape*/ SH_STAR,
    );
}

function renderUnits(now: number) {
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    const ut = getUnitType(u.type);
    const c = getColor(u.type, u.team);
    const hr = u.hp / u.maxHp;
    const flash = hr < 0.3 ? Math.sin(now * 15) * 0.3 + 0.7 : 1;
    const sf = u.stun > 0 ? Math.sin(now * 25) * 0.3 + 0.5 : 1;

    if (u.shieldLingerTimer > 0) writeInstance(u.x, u.y, ut.size * 1.8, 0.3, 0.6, 1, 0.5, now * 0.5, SH_OCT_SHIELD);
    else if (ut.reflects) writeInstance(u.x, u.y, ut.size * 1.8, 0.3, 0.6, 1, 0.15, now * 0.5, SH_OCT_SHIELD);
    renderStunStars(u, ut, now);
    if (u.vet > 0) writeOverlay(u.x, u.y, ut.size * 1.4, 1, 1, 0.5, 0.08 + u.vet * 0.06, SH_EXPLOSION_RING);
    if (u.swarmN > 0)
      writeOverlay(u.x, u.y, ut.size * 2.2, c[0], c[1], c[2], 0.06 + u.swarmN * 0.03, SH_EXPLOSION_RING);
    writeInstance(
      u.x,
      u.y,
      ut.size,
      /*r*/ c[0] * flash * sf,
      /*g*/ c[1] * flash * sf,
      /*b*/ c[2] * flash * sf,
      /*a*/ 0.9,
      u.angle,
      ut.shape,
    );
    renderHpBar(u, ut);
    renderVetBadges(u, ut, now);
  }
}

function renderParticles() {
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = getParticle(i);
    if (!p.alive) continue;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lightning beam logic adds complexity
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
      const lSteps = Math.max(3, (d / 8) | 0);
      const perpX = -Math.sin(ang),
        perpY = Math.cos(ang);
      const pts: number[] = [];
      for (let j = 0; j <= lSteps; j++) {
        const t = j / lSteps;
        let off = 0;
        if (j > 0 && j < lSteps) {
          const h = Math.sin(j * 127.1 + now * 40) * 43758.5;
          const rnd = h - Math.floor(h);
          off = (rnd * 2 - 1) * bm.width * 4;
        }
        pts.push(bm.x1 + dx * t + perpX * off, bm.y1 + dy * t + perpY * off);
      }
      for (let j = 0; j < lSteps; j++) {
        const x0 = pts[j * 2] as number,
          y0 = pts[j * 2 + 1] as number;
        const x1 = pts[j * 2 + 2] as number,
          y1 = pts[j * 2 + 3] as number;
        const mx = (x0 + x1) * 0.5,
          my = (y0 + y1) * 0.5;
        const segDx = x1 - x0,
          segDy = y1 - y0;
        const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
        const segAng = Math.atan2(segDy, segDx);
        const fl = 0.8 + Math.sin(j * 5.0 + now * 55) * 0.2;
        const white = 0.5 + al * 0.5;
        writeBeamSegment(
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
    } else {
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const fl = 0.7 + Math.sin(j * 2.5 + now * 35) * 0.3;
        const tipScale = bm.tapered ? computeTaperScale(steps - j) : 1;
        writeBeamSegment(
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
      writeBeamSegment(
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

function renderProjectiles() {
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const pr = getProjectile(i);
    if (!pr.alive) continue;
    let shape: number;
    if (pr.homing) shape = SH_HOMING;
    else if (pr.aoe > 0) shape = SH_CIRCLE;
    else shape = SH_DIAMOND;
    writeInstance(pr.x, pr.y, pr.size, pr.r, pr.g, pr.b, /*a*/ 1, Math.atan2(pr.vy, pr.vx), shape);
  }
}

// TAU multiple keeps sin(now*N) continuous at wrap boundary; ×10000 ≈ 17.5h before reset
const WRAP_PERIOD = TAU * 10000;

export function renderScene(now: number): number {
  _writer.idx = 0;
  const t = now % WRAP_PERIOD;

  renderParticles();
  renderBeams(t);
  renderProjectiles();
  renderUnits(t);

  return _writer.idx;
}
