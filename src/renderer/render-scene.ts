import { getColor } from '../colors.ts';
import { MAX_INSTANCES, POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit } from '../pools.ts';
import { asteroids, bases, beams, getAsteroid, getBeam, state } from '../state.ts';
import { type Color3, TEAMS } from '../types.ts';
import { devWarn } from '../ui/dev-overlay.ts';
import { getUnitType } from '../unit-types.ts';
import { instanceData } from './buffers.ts';

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
  if (_writer.idx >= MAX_INSTANCES) {
    if (!_writer.overflowWarned) {
      devWarn(`writeInstance: idx(${_writer.idx}) >= MAX_INSTANCES(${MAX_INSTANCES}), drawing skipped`);
      _writer.overflowWarned = true;
    }
    return;
  }
  const B = _writer.idx * 9;
  instanceData[B] = x;
  instanceData[B + 1] = y;
  instanceData[B + 2] = size;
  instanceData[B + 3] = r;
  instanceData[B + 4] = g;
  instanceData[B + 5] = b;
  instanceData[B + 6] = a;
  instanceData[B + 7] = angle;
  instanceData[B + 8] = shape;
  _writer.idx++;
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

    if (u.shielded) writeInstance(u.x, u.y, ut.size * 1.8, 0.3, 0.6, 1, 0.18, 0, 5);
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
          0,
        );
      }
    }
    if (u.vet > 0) writeInstance(u.x, u.y, ut.size * 1.4, 1, 1, 0.5, 0.08 + u.vet * 0.06, 0, 10);
    writeInstance(u.x, u.y, ut.size, c[0] * flash * sf, c[1] * flash * sf, c[2] * flash * sf, 0.9, u.angle, ut.shape);
    if (ut.size >= 10 && hr < 1) {
      const bw = ut.size * 1.5;
      writeInstance(u.x - bw * 0.5 + bw * hr * 0.5, u.y - ut.size * 1.3, bw * hr * 0.5, 1 - hr, hr, 0.2, 0.55, 0, 0);
    }
    if (u.vet >= 1) writeInstance(u.x + ut.size * 1.1, u.y - ut.size * 1.1, 2, 1, 1, 0.3, 0.8, now * 3, 7);
    if (u.vet >= 2) writeInstance(u.x + ut.size * 1.1 + 5, u.y - ut.size * 1.1, 2, 1, 0.5, 0.3, 0.8, now * 3, 7);
  }
}

function renderEnvironment(now: number) {
  // Asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const a = getAsteroid(i);
    writeInstance(a.x, a.y, a.radius, 0.12, 0.1, 0.08, 0.7, a.angle, 3);
  }
  // Bases
  if (state.gameMode === 2) {
    for (const tm of TEAMS) {
      const b = bases[tm],
        hr = b.hp / b.maxHp;
      const bc: Color3 = tm === 0 ? [0.2, 0.8, 1] : [1, 0.4, 0.8];
      writeInstance(b.x, b.y, 50, bc[0] * hr, bc[1] * hr, bc[2] * hr, 0.8, now * 0.2, 20);
      writeInstance(b.x, b.y, 60, bc[0] * 0.3, bc[1] * 0.3, bc[2] * 0.3, 0.2 + Math.sin(now * 3) * 0.1, now * -0.1, 10);
      const bw = 50;
      writeInstance(b.x - bw * 0.5 + bw * hr * 0.5, b.y - 65, bw * hr * 0.5, 1 - hr, hr, 0.2, 0.7, 0, 0);
    }
  }
}

export function renderScene(now: number): number {
  _writer.idx = 0;

  if (!state.catalogOpen) {
    renderEnvironment(now);
  }

  // Particles
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = getParticle(i);
    if (!p.alive) continue;
    const al = Math.min(1, p.life / p.maxLife);
    let size = p.size * (0.5 + al * 0.5);
    const shape = p.shape;
    if (shape === 10) size = p.size * (2.2 - al * 1.7);
    writeInstance(p.x, p.y, size, p.r * al, p.g * al, p.b * al, al * 0.8, 0, shape);
  }

  // Beams
  for (let i = 0; i < beams.length; i++) {
    const bm = getBeam(i);
    const al = bm.life / bm.maxLife;
    const dx = bm.x2 - bm.x1,
      dy = bm.y2 - bm.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(3, (d / 5) | 0);
    const ang = Math.atan2(dy, dx);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const fl = 0.7 + Math.sin(j * 2.5 + now * 35) * 0.3;
      writeInstance(
        bm.x1 + dx * t,
        bm.y1 + dy * t,
        bm.width * (1 + Math.sin(j * 0.6 + now * 25) * 0.25),
        bm.r * al * fl,
        bm.g * al * fl,
        bm.b * al * fl,
        al * 0.85,
        ang,
        12,
      );
    }
  }

  // Projectiles
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const pr = getProjectile(i);
    if (!pr.alive) continue;
    let shape: number;
    if (pr.homing) shape = 6;
    else if (pr.aoe > 0) shape = 0;
    else shape = 1;
    writeInstance(pr.x, pr.y, pr.size, pr.r, pr.g, pr.b, 1, Math.atan2(pr.vy, pr.vx), shape);
  }

  // Units
  renderUnits(now);

  return _writer.idx;
}
