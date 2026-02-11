import { gC } from '../colors.ts';
import { PPR } from '../constants.ts';
import { prP, uP } from '../pools.ts';
import type { Unit } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { chainLightning, explosion } from './effects.ts';
import { _nb, gN, kb } from './spatial-hash.ts';
import { addBeam, killU, spP, spPr, spU } from './spawn.ts';

function tgtDistOrClear(u: Unit): number {
  if (u.tgt < 0) return -1;
  var o = uP[u.tgt]!;
  if (!o.alive) {
    u.tgt = -1;
    return -1;
  }
  return Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
}

export function combat(u: Unit, ui: number, dt: number, _now: number) {
  var t = TYPES[u.type]!;
  if (u.stun > 0) return;
  u.cd -= dt;
  u.aCd -= dt;
  var c = gC(u.type, u.team);
  var vd = 1 + u.vet * 0.2;

  // --- RAM ---
  if (t.rams) {
    var nn = gN(u.x, u.y, t.sz * 2, _nb);
    for (var i = 0; i < nn; i++) {
      var oi = _nb[i]!,
        o = uP[oi]!;
      if (!o.alive || o.team === u.team) continue;
      var dx = o.x - u.x,
        dy = o.y - u.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < t.sz + TYPES[o.type]!.sz) {
        o.hp -= Math.ceil(u.mass * 3 * vd);
        kb(oi, u.x, u.y, u.mass * 55);
        u.hp -= Math.ceil(TYPES[o.type]!.mass);
        for (var k = 0; k < 10; k++) {
          var a = Math.random() * 6.283;
          spP(
            (u.x + o.x) / 2,
            (u.y + o.y) / 2,
            Math.cos(a) * (80 + Math.random() * 160),
            Math.sin(a) * (80 + Math.random() * 160),
            0.15,
            2 + Math.random() * 2,
            1,
            0.9,
            0.4,
            0,
          );
        }
        if (o.hp <= 0) {
          killU(oi);
          explosion(o.x, o.y, o.team, o.type, ui);
        }
        if (u.hp <= 0) {
          killU(ui);
          explosion(u.x, u.y, u.team, u.type, -1);
          return;
        }
      }
    }
    return;
  }

  // --- HEALER ---
  if (t.heals && u.aCd <= 0) {
    u.aCd = 0.35;
    var nn = gN(u.x, u.y, 160, _nb);
    for (var i = 0; i < nn; i++) {
      var oi = _nb[i]!,
        o = uP[oi]!;
      if (!o.alive || o.team !== u.team || oi === ui) continue;
      if (o.hp < o.mhp) {
        o.hp = Math.min(o.mhp, o.hp + 3);
        addBeam(u.x, u.y, o.x, o.y, 0.2, 1, 0.5, 0.12, 2.5);
      }
    }
    spP(u.x, u.y, 0, 0, 0.2, 20, 0.2, 1, 0.4, 10);
  }

  // --- REFLECTOR ---
  if (t.reflects) {
    var rr = t.rng;
    for (var i = 0; i < PPR; i++) {
      var p = prP[i]!;
      if (!p.alive || p.team === u.team) continue;
      if ((p.x - u.x) * (p.x - u.x) + (p.y - u.y) * (p.y - u.y) < rr * rr) {
        p.vx *= -1.2;
        p.vy *= -1.2;
        p.team = u.team;
        p.r = c[0];
        p.g = c[1];
        p.b = c[2];
        spP(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.12, 3, c[0], c[1], c[2], 0);
        spP(p.x, p.y, 0, 0, 0.1, 8, 1, 1, 1, 10);
      }
    }
    if (u.cd <= 0 && u.tgt >= 0) {
      var o = uP[u.tgt]!;
      if (!o.alive) {
        u.tgt = -1;
      } else {
        var dx = o.x - u.x,
          dy = o.y - u.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < rr) {
          u.cd = t.fr;
          var ang = Math.atan2(dy, dx);
          spPr(
            u.x,
            u.y,
            Math.cos(ang) * 400,
            Math.sin(ang) * 400,
            d / 400 + 0.1,
            t.dmg * vd,
            u.team,
            1.5,
            c[0],
            c[1],
            c[2],
          );
        }
      }
    }
    if (Math.random() < 0.1) {
      spP(
        u.x + (Math.random() - 0.5) * rr * 1.5,
        u.y + (Math.random() - 0.5) * rr * 1.5,
        0,
        0,
        0.15,
        2,
        c[0] * 0.5,
        c[1] * 0.5,
        c[2] * 0.5,
        0,
      );
    }
    return;
  }

  // --- CARRIER ---
  if (t.spawns) {
    u.sCd -= dt;
    if (u.sCd <= 0) {
      u.sCd = 4 + Math.random() * 2;
      for (var i = 0; i < 4; i++) {
        var a = Math.random() * 6.283;
        spU(u.team, 0, u.x + Math.cos(a) * t.sz * 2, u.y + Math.sin(a) * t.sz * 2);
      }
      for (var i = 0; i < 10; i++) {
        var a = Math.random() * 6.283;
        spP(
          u.x + Math.cos(a) * t.sz,
          u.y + Math.sin(a) * t.sz,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 50,
          0.3,
          3,
          c[0],
          c[1],
          c[2],
          0,
        );
      }
    }
  }

  // --- EMP ---
  if (t.emp && u.aCd <= 0) {
    var d = tgtDistOrClear(u);
    if (d < 0) return;
    if (d < t.rng) {
      u.aCd = t.fr;
      var nn = gN(u.x, u.y, t.rng, _nb);
      for (var i = 0; i < nn; i++) {
        var oi = _nb[i]!,
          oo = uP[oi]!;
        if (!oo.alive || oo.team === u.team) continue;
        if ((oo.x - u.x) * (oo.x - u.x) + (oo.y - u.y) * (oo.y - u.y) < t.rng * t.rng) {
          oo.stun = 1.5;
          oo.hp -= t.dmg;
          if (oo.hp <= 0) {
            killU(oi);
            explosion(oo.x, oo.y, oo.team, oo.type, ui);
          }
        }
      }
      for (var i = 0; i < 20; i++) {
        var a = (i / 20) * 6.283,
          r = t.rng * 0.8;
        spP(
          u.x + Math.cos(a) * r,
          u.y + Math.sin(a) * r,
          (Math.random() - 0.5) * 25,
          (Math.random() - 0.5) * 25,
          0.35,
          3,
          0.5,
          0.5,
          1,
          0,
        );
      }
      spP(u.x, u.y, 0, 0, 0.45, t.rng * 0.7, 0.4, 0.4, 1, 10);
    }
    return;
  }

  // --- TELEPORTER ---
  if (t.teleports) {
    u.tp -= dt;
    if (u.tp <= 0 && u.tgt >= 0) {
      var o = uP[u.tgt]!;
      if (!o.alive) {
        u.tgt = -1;
      } else {
        var d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
        if (d < 500 && d > 80) {
          u.tp = 3 + Math.random() * 2;
          for (var i = 0; i < 8; i++) {
            var a = Math.random() * 6.283;
            spP(u.x, u.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.25, 3, c[0], c[1], c[2], 0);
          }
          spP(u.x, u.y, 0, 0, 0.3, 16, c[0], c[1], c[2], 10);
          var ta = Math.random() * 6.283,
            td = 55 + Math.random() * 35;
          u.x = o.x + Math.cos(ta) * td;
          u.y = o.y + Math.sin(ta) * td;
          for (var i = 0; i < 8; i++) {
            var a = Math.random() * 6.283;
            spP(u.x, u.y, Math.cos(a) * 55, Math.sin(a) * 55, 0.2, 3, c[0], c[1], c[2], 0);
          }
          spP(u.x, u.y, 0, 0, 0.2, 14, 1, 1, 1, 10);
          for (var i = 0; i < 5; i++) {
            var ba = Math.random() * 6.283;
            spPr(u.x, u.y, Math.cos(ba) * 430, Math.sin(ba) * 430, 0.3, t.dmg * vd, u.team, 2, c[0], c[1], c[2]);
          }
        }
      }
    }
  }

  // --- CHAIN LIGHTNING ---
  if (t.chain && u.cd <= 0) {
    var d = tgtDistOrClear(u);
    if (d < 0) return;
    if (d < t.rng) {
      u.cd = t.fr;
      chainLightning(u.x, u.y, u.team, t.dmg * vd, 5, c);
      spP(u.x, u.y, 0, 0, 0.15, t.sz, c[0], c[1], c[2], 10);
    }
    return;
  }

  // --- BEAM ---
  if (t.beam) {
    if (u.tgt >= 0) {
      var o = uP[u.tgt]!;
      if (o.alive) {
        var d = Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
        if (d < t.rng) {
          u.beamOn = Math.min(u.beamOn + dt * 2, 1);
          u.cd -= dt;
          if (u.cd <= 0) {
            u.cd = t.fr;
            var dmg = t.dmg * u.beamOn * vd;
            if (o.shielded) dmg *= 0.4; // 60% reduction under reflector shield
            o.hp -= dmg;
            kb(u.tgt, u.x, u.y, dmg * 5);
            for (var i = 0; i < 2; i++) {
              spP(
                o.x + (Math.random() - 0.5) * 8,
                o.y + (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 50,
                (Math.random() - 0.5) * 50,
                0.08,
                2,
                c[0],
                c[1],
                c[2],
                0,
              );
            }
            if (o.hp <= 0) {
              killU(u.tgt);
              explosion(o.x, o.y, o.team, o.type, ui);
              u.beamOn = 0;
            }
          }
          var bw = (t.sz >= 15 ? 6 : 4) * u.beamOn;
          addBeam(
            u.x + Math.cos(u.ang) * t.sz * 0.5,
            u.y + Math.sin(u.ang) * t.sz * 0.5,
            o.x,
            o.y,
            c[0],
            c[1],
            c[2],
            0.08,
            bw,
          );
        } else {
          u.beamOn = Math.max(0, u.beamOn - dt * 3);
        }
      } else {
        u.tgt = -1;
        u.beamOn = Math.max(0, u.beamOn - dt * 3);
      }
    } else {
      u.beamOn = Math.max(0, u.beamOn - dt * 3);
    }
    if (!t.spawns) return;
  }

  // --- NORMAL FIRE ---
  if (u.cd <= 0 && u.tgt >= 0) {
    var o = uP[u.tgt]!;
    if (!o.alive) {
      u.tgt = -1;
      return;
    }
    var dx = o.x - u.x,
      dy = o.y - u.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < t.rng) {
      u.cd = t.fr;
      var ang = Math.atan2(dy, dx);

      if (t.homing) {
        spPr(
          u.x,
          u.y,
          Math.cos(ang) * 280,
          Math.sin(ang) * 280,
          d / 280 + 1,
          t.dmg * vd,
          u.team,
          2.5,
          c[0],
          c[1],
          c[2],
          true,
          0,
          u.tgt,
        );
      } else if (t.aoe) {
        spPr(
          u.x,
          u.y,
          Math.cos(ang) * 170,
          Math.sin(ang) * 170,
          d / 170 + 0.2,
          t.dmg * vd,
          u.team,
          5,
          c[0] * 0.8,
          c[1] * 0.7 + 0.3,
          c[2],
          false,
          t.aoe,
        );
      } else if (t.sh === 3) {
        for (var i = -2; i <= 2; i++) {
          var ba = ang + i * 0.25;
          spPr(
            u.x + Math.cos(ba) * t.sz,
            u.y + Math.sin(ba) * t.sz,
            Math.cos(ba) * 420,
            Math.sin(ba) * 420,
            t.rng / 420 + 0.1,
            t.dmg * vd,
            u.team,
            2,
            c[0],
            c[1],
            c[2],
          );
        }
      } else if (t.sh === 8) {
        spPr(
          u.x + Math.cos(ang) * t.sz,
          u.y + Math.sin(ang) * t.sz,
          Math.cos(ang) * 900,
          Math.sin(ang) * 900,
          t.rng / 900 + 0.05,
          t.dmg * vd,
          u.team,
          3,
          c[0] * 0.5 + 0.5,
          c[1] * 0.5 + 0.5,
          c[2] * 0.5 + 0.5,
        );
        addBeam(u.x, u.y, u.x + Math.cos(ang) * t.rng, u.y + Math.sin(ang) * t.rng, c[0], c[1], c[2], 0.1, 1.5);
        for (var i = 0; i < 4; i++) {
          var a2 = ang + (Math.random() - 0.5) * 0.4;
          spP(
            u.x + Math.cos(ang) * t.sz * 1.5,
            u.y + Math.sin(ang) * t.sz * 1.5,
            Math.cos(a2) * 160,
            Math.sin(a2) * 160,
            0.08,
            2.5,
            1,
            1,
            0.8,
            0,
          );
        }
      } else {
        var sp = 480 + t.dmg * 12;
        spPr(
          u.x + Math.cos(u.ang) * t.sz,
          u.y + Math.sin(u.ang) * t.sz,
          Math.cos(ang) * sp + u.vx * 0.3,
          Math.sin(ang) * sp + u.vy * 0.3,
          d / sp + 0.1,
          t.dmg * vd,
          u.team,
          1 + t.dmg * 0.2,
          c[0],
          c[1],
          c[2],
        );
      }

      if (!t.homing && !t.aoe && t.sh !== 8) {
        for (var i = 0; i < 2; i++) {
          spP(
            u.x + Math.cos(u.ang) * t.sz,
            u.y + Math.sin(u.ang) * t.sz,
            Math.cos(ang) * (60 + Math.random() * 60) + (Math.random() - 0.5) * 35,
            Math.sin(ang) * (60 + Math.random() * 60) + (Math.random() - 0.5) * 35,
            0.07,
            2 + Math.random() * 1.5,
            c[0],
            c[1],
            c[2],
            0,
          );
        }
      }
    }
  }
}
