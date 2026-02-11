import { PU, PP, PPR, WORLD } from '../constants.ts';
import { uP, pP, prP, poolCounts } from '../pools.ts';
import { gameMode, beams, asteroids, bases } from '../state.ts';
import { spU } from './spawn.ts';

function genAsteroids() {
  asteroids.length = 0;
  for (var i = 0; i < 40; i++) {
    asteroids.push({
      x: (Math.random() - 0.5) * WORLD * 1.4,
      y: (Math.random() - 0.5) * WORLD * 1.4,
      r: 20 + Math.random() * 60,
      ang: Math.random() * 6.28,
      va: (0.02 + Math.random() * 0.03) * (Math.random() < 0.5 ? 1 : -1),
    });
  }
}

export function initUnits() {
  for (var i = 0; i < PU; i++) uP[i].alive = false;
  poolCounts.uC = 0;
  for (var i = 0; i < PP; i++) pP[i].alive = false;
  poolCounts.pC = 0;
  for (var i = 0; i < PPR; i++) prP[i].alive = false;
  poolCounts.prC = 0;
  beams.length = 0;
  bases[0].hp = bases[0].mhp;
  bases[1].hp = bases[1].mhp;
  genAsteroids();

  var n = [2, 1, 4, 3, 20, 50, 3, 2, 4, 3, 3, 2, 3, 2, 2];
  if (gameMode === 1) {
    for (var i = 0; i < n.length; i++) n[i] = Math.ceil(n[i] * 0.7);
  }

  for (var team = 0; team < 2; team++) {
    var cx = team === 0 ? -1200 : 1200;
    var cy = team === 0 ? -300 : 300;
    var s = function (tp: number, count: number, spread: number) {
      for (var j = 0; j < count; j++) {
        spU(team, tp, cx + (Math.random() - 0.5) * spread, cy + (Math.random() - 0.5) * spread);
      }
    };
    s(4, n[0], 200);
    s(7, n[1], 150);
    s(3, n[2], 500);
    s(2, n[3], 400);
    s(1, n[4], 700);
    s(0, n[5], 900);
    s(5, n[6], 400);
    s(6, n[7], 300);
    s(8, n[8], 600);
    s(9, n[9], 400);
    s(10, n[10], 500);
    s(11, n[11], 400);
    s(12, n[12], 400);
    s(13, n[13], 400);
    s(14, n[14], 400);
  }
}
