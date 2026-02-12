import { gC } from '../colors.ts';
import { MAX_INSTANCES, POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { particlePool, projectilePool, unitPool } from '../pools.ts';
import { asteroids, bases, beams, catalogOpen, gameMode } from '../state.ts';
import type { Color3 } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { iD } from './buffers.ts';

export function renderScene(now: number): number {
  let idx = 0;

  function wr(x: number, y: number, sz: number, r: number, g: number, b: number, a: number, ang: number, sh: number) {
    if (idx >= MAX_INSTANCES) return;
    const B = idx * 9;
    iD[B] = x;
    iD[B + 1] = y;
    iD[B + 2] = sz;
    iD[B + 3] = r;
    iD[B + 4] = g;
    iD[B + 5] = b;
    iD[B + 6] = a;
    iD[B + 7] = ang;
    iD[B + 8] = sh;
    idx++;
  }

  if (!catalogOpen) {
    // Asteroids
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i]!;
      wr(a.x, a.y, a.radius, 0.12, 0.1, 0.08, 0.7, a.angle, 3);
    }
    // Bases
    if (gameMode === 2) {
      for (let i = 0; i < 2; i++) {
        const b = bases[i]!,
          hr = b.hp / b.maxHp;
        const bc: Color3 = i === 0 ? [0.2, 0.8, 1] : [1, 0.4, 0.8];
        wr(b.x, b.y, 50, bc[0] * hr, bc[1] * hr, bc[2] * hr, 0.8, now * 0.2, 20);
        wr(b.x, b.y, 60, bc[0] * 0.3, bc[1] * 0.3, bc[2] * 0.3, 0.2 + Math.sin(now * 3) * 0.1, now * -0.1, 10);
        const bw = 50;
        wr(b.x - bw * 0.5 + bw * hr * 0.5, b.y - 65, bw * hr * 0.5, 1 - hr, hr, 0.2, 0.7, 0, 0);
      }
    }
  }

  // Particles
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = particlePool[i]!;
    if (!p.alive) continue;
    const al = Math.min(1, p.life / p.maxLife);
    let sz = p.size * (0.5 + al * 0.5);
    const sh = p.shape;
    if (sh === 10) sz = p.size * (2.2 - al * 1.7);
    wr(p.x, p.y, sz, p.r * al, p.g * al, p.b * al, al * 0.8, 0, sh);
  }

  // Beams
  for (let i = 0; i < beams.length; i++) {
    const bm = beams[i]!;
    const al = bm.life / bm.maxLife;
    const dx = bm.x2 - bm.x1,
      dy = bm.y2 - bm.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(3, (d / 5) | 0);
    const ang = Math.atan2(dy, dx);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const fl = 0.7 + Math.sin(j * 2.5 + now * 35) * 0.3;
      wr(
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
    const pr = projectilePool[i]!;
    if (!pr.alive) continue;
    let shape: number;
    if (pr.homing) shape = 6;
    else if (pr.aoe > 0) shape = 0;
    else shape = 1;
    wr(pr.x, pr.y, pr.size, pr.r, pr.g, pr.b, 1, Math.atan2(pr.vy, pr.vx), shape);
  }

  // Units
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unitPool[i]!;
    if (!u.alive) continue;
    const ut = TYPES[u.type]!;
    const c = gC(u.type, u.team);
    const hr = u.hp / u.maxHp;
    const flash = hr < 0.3 ? Math.sin(now * 15) * 0.3 + 0.7 : 1;
    const sf = u.stun > 0 ? Math.sin(now * 25) * 0.3 + 0.5 : 1;

    if (u.shielded) wr(u.x, u.y, ut.size * 1.8, 0.3, 0.6, 1, 0.18, 0, 5);
    if (u.stun > 0) {
      for (let j = 0; j < 2; j++) {
        const sa = now * 5 + j * 3.14;
        wr(u.x + Math.cos(sa) * ut.size * 0.7, u.y + Math.sin(sa) * ut.size * 0.7, 2, 0.5, 0.5, 1, 0.5, 0, 0);
      }
    }
    if (u.vet > 0) wr(u.x, u.y, ut.size * 1.4, 1, 1, 0.5, 0.08 + u.vet * 0.06, 0, 10);
    wr(u.x, u.y, ut.size, c[0] * flash * sf, c[1] * flash * sf, c[2] * flash * sf, 0.9, u.angle, ut.shape);
    if (ut.size >= 10 && hr < 1) {
      const bw = ut.size * 1.5;
      wr(u.x - bw * 0.5 + bw * hr * 0.5, u.y - ut.size * 1.3, bw * hr * 0.5, 1 - hr, hr, 0.2, 0.55, 0, 0);
    }
    if (u.vet >= 1) wr(u.x + ut.size * 1.1, u.y - ut.size * 1.1, 2, 1, 1, 0.3, 0.8, now * 3, 7);
    if (u.vet >= 2) wr(u.x + ut.size * 1.1 + 5, u.y - ut.size * 1.1, 2, 1, 0.5, 0.3, 0.8, now * 3, 7);
  }

  return idx;
}
