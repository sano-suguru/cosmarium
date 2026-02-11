import { iD } from './buffers.ts';
import { MAX_I } from '../constants.ts';
import { PP, PPR, PU } from '../constants.ts';
import { uP, pP, prP } from '../pools.ts';
import { TYPES } from '../unit-types.ts';
import { gC } from '../colors.ts';
import { catalogOpen, gameMode, asteroids, bases, beams } from '../state.ts';

export function renderScene(now: number): number {
  var idx = 0;

  function wr(x: number, y: number, sz: number, r: number, g: number, b: number, a: number, ang: number, sh: number) {
    if (idx >= MAX_I) return;
    var B = idx * 9;
    iD[B]=x; iD[B+1]=y; iD[B+2]=sz;
    iD[B+3]=r; iD[B+4]=g; iD[B+5]=b; iD[B+6]=a;
    iD[B+7]=ang; iD[B+8]=sh; idx++;
  }

  if (!catalogOpen) {
    // Asteroids
    for (var i = 0; i < asteroids.length; i++) {
      var a = asteroids[i];
      wr(a.x, a.y, a.r, 0.12, 0.1, 0.08, 0.7, a.ang, 3);
    }
    // Bases
    if (gameMode === 2) {
      for (var i = 0; i < 2; i++) {
        var b = bases[i], hr = b.hp / b.mhp;
        var bc = i === 0 ? [0.2,0.8,1] : [1,0.4,0.8];
        wr(b.x, b.y, 50, bc[0]*hr, bc[1]*hr, bc[2]*hr, 0.8, now*0.2, 20);
        wr(b.x, b.y, 60, bc[0]*0.3, bc[1]*0.3, bc[2]*0.3,
           0.2 + Math.sin(now*3)*0.1, now*-0.1, 10);
        var bw = 50;
        wr(b.x - bw*0.5 + bw*hr*0.5, b.y - 65, bw*hr*0.5,
           1-hr, hr, 0.2, 0.7, 0, 0);
      }
    }
  }

  // Particles
  for (var i = 0; i < PP; i++) {
    var p = pP[i]; if (!p.alive) continue;
    var al = Math.min(1, p.life / p.ml);
    var sz = p.sz * (0.5 + al*0.5);
    var sh = p.sh;
    if (sh === 10) sz = p.sz * (2.2 - al*1.7);
    wr(p.x, p.y, sz, p.r*al, p.g*al, p.b*al, al*0.8, 0, sh);
  }

  // Beams
  for (var i = 0; i < beams.length; i++) {
    var bm = beams[i];
    var al = bm.life / bm.ml;
    var dx = bm.x2 - bm.x1, dy = bm.y2 - bm.y1;
    var d = Math.sqrt(dx*dx + dy*dy);
    var steps = Math.max(3, d / 5 | 0);
    var ang = Math.atan2(dy, dx);
    for (var j = 0; j <= steps; j++) {
      var t = j / steps;
      var fl = 0.7 + Math.sin(j*2.5 + now*35) * 0.3;
      wr(bm.x1 + dx*t, bm.y1 + dy*t,
         bm.w * (1 + Math.sin(j*0.6 + now*25)*0.25),
         bm.r*al*fl, bm.g*al*fl, bm.b*al*fl, al*0.85, ang, 12);
    }
  }

  // Projectiles
  for (var i = 0; i < PPR; i++) {
    var pr = prP[i]; if (!pr.alive) continue;
    wr(pr.x, pr.y, pr.sz, pr.r, pr.g, pr.b, 1,
       Math.atan2(pr.vy, pr.vx), pr.hom ? 6 : pr.aoe > 0 ? 0 : 1);
  }

  // Units
  for (var i = 0; i < PU; i++) {
    var u = uP[i]; if (!u.alive) continue;
    var ut = TYPES[u.type];
    var c = gC(u.type, u.team);
    var hr = u.hp / u.mhp;
    var flash = hr < 0.3 ? (Math.sin(now*15)*0.3 + 0.7) : 1;
    var sf = u.stun > 0 ? (Math.sin(now*25)*0.3 + 0.5) : 1;

    if (u.shielded) wr(u.x, u.y, ut.sz*1.8, 0.3, 0.6, 1, 0.18, 0, 5);
    if (u.stun > 0) {
      for (var j = 0; j < 2; j++) {
        var sa = now*5 + j*3.14;
        wr(u.x + Math.cos(sa)*ut.sz*0.7, u.y + Math.sin(sa)*ut.sz*0.7,
           2, 0.5, 0.5, 1, 0.5, 0, 0);
      }
    }
    if (u.vet > 0) wr(u.x, u.y, ut.sz*1.4, 1, 1, 0.5, 0.08+u.vet*0.06, 0, 10);
    wr(u.x, u.y, ut.sz, c[0]*flash*sf, c[1]*flash*sf, c[2]*flash*sf, 0.9, u.ang, ut.sh);
    if (ut.sz >= 10 && hr < 1) {
      var bw = ut.sz * 1.5;
      wr(u.x - bw*0.5 + bw*hr*0.5, u.y - ut.sz*1.3,
         bw*hr*0.5, 1-hr, hr, 0.2, 0.55, 0, 0);
    }
    if (u.vet >= 1) wr(u.x+ut.sz*1.1, u.y-ut.sz*1.1, 2, 1,1,0.3, 0.8, now*3, 7);
    if (u.vet >= 2) wr(u.x+ut.sz*1.1+5, u.y-ut.sz*1.1, 2, 1,0.5,0.3, 0.8, now*3, 7);
  }

  return idx;
}
