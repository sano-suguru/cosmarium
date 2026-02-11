import { gC, gTr } from '../colors.ts';
import { addShake } from '../input/camera.ts';
import { uP } from '../pools.ts';
import type { Color3, Team, Unit } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { _nb, gN, kb } from './spatial-hash.ts';
import { addBeam, killU, spP } from './spawn.ts';

export function explosion(x: number, y: number, team: Team, type: number, killer: number) {
  const sz = TYPES[type]!.sz;
  const c = gC(type, team);
  const cnt = Math.min((18 + sz * 3) | 0, 50);

  for (let i = 0; i < cnt; i++) {
    const a = Math.random() * 6.283;
    const sp = 40 + Math.random() * 200 * (sz / 10);
    const lf = 0.3 + Math.random() * 0.8;
    spP(
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      lf,
      2 + Math.random() * sz * 0.4,
      c[0] * 0.5 + 0.5,
      c[1] * 0.5 + 0.5,
      c[2] * 0.5 + 0.5,
      0,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * 6.283;
    spP(
      x,
      y,
      Math.cos(a) * Math.random() * 50,
      Math.sin(a) * Math.random() * 50,
      0.1 + Math.random() * 0.12,
      sz * 0.7 + Math.random() * 3,
      1,
      1,
      1,
      0,
    );
  }
  const dc = Math.min((sz * 2) | 0, 14);
  for (let i = 0; i < dc; i++) {
    const a = Math.random() * 6.283;
    const sp = 15 + Math.random() * 140;
    spP(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 2, 1 + Math.random() * 2, 0.5, 0.35, 0.2, 0);
  }
  spP(x, y, 0, 0, 0.45, sz * 2.5, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 10);

  if (sz >= 14) addShake(sz * 0.8);

  const nn = gN(x, y, sz * 8, _nb);
  for (let i = 0; i < nn; i++) {
    const o = uP[_nb[i]!]!;
    if (!o.alive) continue;
    const ddx = o.x - x,
      ddy = o.y - y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    if (dd < sz * 8) kb(_nb[i]!, x, y, (sz * 50) / (dd * 0.1 + 1));
  }
  if (killer >= 0 && killer < uP.length) {
    const ku = uP[killer]!;
    if (ku.alive) {
      ku.kills++;
      if (ku.kills >= 3) ku.vet = 1;
      if (ku.kills >= 8) ku.vet = 2;
    }
  }
}

export function trail(u: Unit) {
  const t = TYPES[u.type]!,
    c = gTr(u.type, u.team);
  const bx = u.x - Math.cos(u.ang) * t.sz * 0.8;
  const by = u.y - Math.sin(u.ang) * t.sz * 0.8;
  spP(
    bx + (Math.random() - 0.5) * t.sz * 0.3,
    by + (Math.random() - 0.5) * t.sz * 0.3,
    -Math.cos(u.ang) * 25 + (Math.random() - 0.5) * 15,
    -Math.sin(u.ang) * 25 + (Math.random() - 0.5) * 15,
    0.1 + Math.random() * 0.22 * t.trl,
    t.sz * 0.3 + Math.random() * 1.5,
    c[0],
    c[1],
    c[2],
    0,
  );
}

export function chainLightning(sx: number, sy: number, team: Team, dmg: number, max: number, col: Color3) {
  let cx = sx,
    cy = sy;
  const hit = new Set();
  for (let ch = 0; ch < max; ch++) {
    const nn = gN(cx, cy, 200, _nb);
    let bd = 200,
      bi = -1;
    for (let i = 0; i < nn; i++) {
      const oi = _nb[i]!,
        o = uP[oi]!;
      if (!o.alive || o.team === team || hit.has(oi)) continue;
      const d = Math.sqrt((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy));
      if (d < bd) {
        bd = d;
        bi = oi;
      }
    }
    if (bi < 0) break;
    hit.add(bi);
    const o = uP[bi]!;
    addBeam(cx, cy, o.x, o.y, col[0], col[1], col[2], 0.2, 1.5);
    for (let i = 0; i < 3; i++) {
      spP(
        o.x + (Math.random() - 0.5) * 8,
        o.y + (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
        0.1,
        2,
        col[0],
        col[1],
        col[2],
        0,
      );
    }
    const dd = dmg * (1 - ch * 0.12);
    o.hp -= dd;
    kb(bi, cx, cy, dd * 8);
    if (o.hp <= 0) {
      killU(bi);
      explosion(o.x, o.y, o.team, o.type, -1);
    }
    cx = o.x;
    cy = o.y;
  }
}
