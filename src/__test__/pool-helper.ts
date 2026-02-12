import { PP, PPR, PU } from '../constants.ts';
import { poolCounts, pP, prP, uP } from '../pools.ts';
import { beams } from '../state.ts';

export function resetPools() {
  for (let i = 0; i < PU; i++) {
    const u = uP[i]!;
    u.alive = false;
    u.team = 0;
    u.type = 0;
    u.x = 0;
    u.y = 0;
    u.vx = 0;
    u.vy = 0;
    u.ang = 0;
    u.hp = 0;
    u.mhp = 0;
    u.cd = 0;
    u.tgt = -1;
    u.wn = 0;
    u.tT = 0;
    u.mass = 1;
    u.aCd = 0;
    u.shielded = false;
    u.stun = 0;
    u.sCd = 0;
    u.tp = 0;
    u.beamOn = 0;
    u.kills = 0;
    u.vet = 0;
  }
  for (let i = 0; i < PP; i++) {
    const p = pP[i]!;
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.ml = 0;
    p.sz = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.sh = 0;
  }
  for (let i = 0; i < PPR; i++) {
    const p = prP[i]!;
    p.alive = false;
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.dmg = 0;
    p.team = 0;
    p.sz = 0;
    p.r = 0;
    p.g = 0;
    p.b = 0;
    p.hom = false;
    p.aoe = 0;
    p.tx = -1;
  }
  poolCounts.uC = 0;
  poolCounts.pC = 0;
  poolCounts.prC = 0;
  beams.length = 0;
}
