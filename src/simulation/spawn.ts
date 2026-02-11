import { PP, PPR, PU } from '../constants.ts';
import { poolCounts, pP, prP, uP } from '../pools.ts';
import { beams } from '../state.ts';
import type { Team } from '../types.ts';
import { TYPES } from '../unit-types.ts';

export function spU(team: Team, type: number, x: number, y: number): number {
  for (let i = 0; i < PU; i++) {
    if (!uP[i]!.alive) {
      const u = uP[i]!,
        t = TYPES[type]!;
      u.alive = true;
      u.team = team;
      u.type = type;
      u.x = x;
      u.y = y;
      u.vx = 0;
      u.vy = 0;
      u.ang = Math.random() * 6.283;
      u.hp = t.hp;
      u.mhp = t.hp;
      u.cd = Math.random() * t.fr;
      u.tgt = -1;
      u.wn = Math.random() * 6.283;
      u.tT = 0;
      u.mass = t.mass;
      u.aCd = 0;
      u.shielded = false;
      u.stun = 0;
      u.sCd = 0;
      u.tp = 0;
      u.beamOn = 0;
      u.kills = 0;
      u.vet = 0;
      poolCounts.uC++;
      return i;
    }
  }
  return -1;
}

export function killU(i: number) {
  if (uP[i]!.alive) {
    uP[i]!.alive = false;
    poolCounts.uC--;
  }
}

export function spP(
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  sz: number,
  r: number,
  g: number,
  b: number,
  sh: number,
): number {
  for (let i = 0; i < PP; i++) {
    if (!pP[i]!.alive) {
      const p = pP[i]!;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.ml = life;
      p.sz = sz;
      p.r = r;
      p.g = g;
      p.b = b;
      p.sh = sh || 0;
      poolCounts.pC++;
      return i;
    }
  }
  return -1;
}

export function spPr(
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  dmg: number,
  team: Team,
  sz: number,
  r: number,
  g: number,
  b: number,
  hom?: boolean,
  aoe?: number,
  tx?: number,
): number {
  for (let i = 0; i < PPR; i++) {
    if (!prP[i]!.alive) {
      const p = prP[i]!;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.dmg = dmg;
      p.team = team;
      p.sz = sz;
      p.r = r;
      p.g = g;
      p.b = b;
      p.hom = hom ?? false;
      p.aoe = aoe ?? 0;
      p.tx = tx ?? -1;
      poolCounts.prC++;
      return i;
    }
  }
  return -1;
}

export function addBeam(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  life: number,
  w: number,
) {
  beams.push({ x1: x1, y1: y1, x2: x2, y2: y2, r: r, g: g, b: b, life: life, ml: life, w: w });
}
