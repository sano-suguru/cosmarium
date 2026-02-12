import { PI, POOL_UNITS, TAU, WORLD_SIZE } from '../constants.ts';
import { uP } from '../pools.ts';
import { asteroids, bases, gameMode } from '../state.ts';
import type { Unit } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { _nb, gN } from './spatial-hash.ts';

export function steer(u: Unit, dt: number) {
  if (u.stun > 0) {
    u.stun -= dt;
    u.vx *= 0.93;
    u.vy *= 0.93;
    u.x += u.vx * dt;
    u.y += u.vy * dt;
    return;
  }
  const t = TYPES[u.type]!;
  let fx = 0,
    fy = 0;
  const nn = gN(u.x, u.y, 200, _nb);
  let sx = 0,
    sy = 0,
    ax = 0,
    ay = 0,
    ac = 0,
    chx = 0,
    chy = 0,
    cc = 0;
  const sd = t.size * 4;

  for (let i = 0; i < nn; i++) {
    const oi = _nb[i]!,
      o = uP[oi]!;
    if (!o.alive || o === u) continue;
    const dx = u.x - o.x,
      dy = u.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) continue;
    const d = Math.sqrt(d2);
    if (d < sd) {
      sx += (dx / d / d2) * 200;
      sy += (dy / d / d2) * 200;
    }
    if (o.team === u.team) {
      if (d < 150) {
        chx += o.x;
        chy += o.y;
        cc++;
      }
      if (o.type === u.type && d < 120) {
        ax += o.vx;
        ay += o.vy;
        ac++;
      }
    }
  }
  fx += sx * 3;
  fy += sy * 3;
  if (ac > 0) {
    fx += (ax / ac - u.vx) * 0.5;
    fy += (ay / ac - u.vy) * 0.5;
  }
  if (cc > 0) {
    fx += (chx / cc - u.x) * 0.01;
    fy += (chy / cc - u.y) * 0.01;
  }

  // Avoid asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!;
    const dx = u.x - a.x,
      dy = u.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < a.radius + t.size * 2) {
      fx += ((dx / d) * 300) / (d + 1);
      fy += ((dy / d) * 300) / (d + 1);
    }
  }

  // Find target
  let tgt = u.target >= 0 && uP[u.target]!.alive ? u.target : -1;
  if (tgt < 0) {
    let bd = t.range * 3,
      bi = -1;
    for (let i = 0; i < nn; i++) {
      const oi = _nb[i]!,
        o = uP[oi]!;
      if (o.team === u.team || !o.alive) continue;
      const d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
      if (d < bd) {
        bd = d;
        bi = oi;
      }
    }
    if (bi < 0 && Math.random() < 0.012) {
      bd = 1e18;
      for (let i = 0; i < POOL_UNITS; i++) {
        const o = uP[i]!;
        if (!o.alive || o.team === u.team) continue;
        const d2 = (o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y);
        if (d2 < bd) {
          bd = d2;
          bi = i;
        }
      }
    }
    tgt = bi;
  }
  u.target = tgt;

  if (gameMode === 2 && tgt < 0) {
    const eb = bases[u.team === 0 ? 1 : 0];
    fx += (eb.x - u.x) * 0.03;
    fy += (eb.y - u.y) * 0.03;
  }

  if (tgt >= 0) {
    const o = uP[tgt]!;
    const dx = o.x - u.x,
      dy = o.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (t.rams) {
      fx += (dx / d) * t.speed * 3;
      fy += (dy / d) * t.speed * 3;
    } else if (d > t.range * 0.7) {
      fx += (dx / d) * t.speed * 2;
      fy += (dy / d) * t.speed * 2;
    } else if (d < t.range * 0.3) {
      fx -= (dx / d) * t.speed;
      fy += (dy / d) * t.speed * 0.5;
    } else {
      fx += (-dy / d) * t.speed * 0.8;
      fy += (dx / d) * t.speed * 0.8;
    }
  } else {
    u.wanderAngle += (Math.random() - 0.5) * 2 * dt;
    fx += Math.cos(u.wanderAngle) * t.speed * 0.5;
    fy += Math.sin(u.wanderAngle) * t.speed * 0.5;
  }

  // Healer follows big ally
  if (t.heals) {
    let bm = 0,
      bi2 = -1;
    for (let i = 0; i < nn; i++) {
      const oi = _nb[i]!,
        o = uP[oi]!;
      if (o.team !== u.team || !o.alive || o === u) continue;
      if (TYPES[o.type]!.mass > bm) {
        bm = TYPES[o.type]!.mass;
        bi2 = oi;
      }
    }
    if (bi2 >= 0) {
      const o = uP[bi2]!;
      fx += (o.x - u.x) * 0.05;
      fy += (o.y - u.y) * 0.05;
    }
  }

  const m = WORLD_SIZE * 0.8;
  if (u.x < -m) fx += 120;
  if (u.x > m) fx -= 120;
  if (u.y < -m) fy += 120;
  if (u.y > m) fy -= 120;

  const da = Math.atan2(fy, fx);
  let ad = da - u.angle;
  if (ad > PI) ad -= TAU;
  if (ad < -PI) ad += TAU;
  u.angle += ad * t.turnRate * dt;

  const spd = t.speed * (1 + u.vet * 0.12);
  u.vx += (Math.cos(u.angle) * spd - u.vx) * dt * 3;
  u.vy += (Math.sin(u.angle) * spd - u.vy) * dt * 3;
  u.vx *= 1 - dt * 0.5;
  u.vy *= 1 - dt * 0.5;
  u.x += u.vx * dt;
  u.y += u.vy * dt;

  // Asteroid collision
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i]!;
    const dx = u.x - a.x,
      dy = u.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < a.radius + t.size) {
      const pen = a.radius + t.size - d;
      u.x += (dx / d) * pen;
      u.y += (dy / d) * pen;
      u.vx += (dx / d) * 50;
      u.vy += (dy / d) * 50;
    }
  }
}
