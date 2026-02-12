import { PI, POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, TAU } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { poolCounts, pP, prP, uP } from '../pools.ts';
import { asteroids, bases, beams, catalogOpen, gameMode, setWinTeam } from '../state.ts';
import { updateCatDemo } from '../ui/catalog.ts';
import { showWin } from '../ui/game-control.ts';
import { TYPES } from '../unit-types.ts';
import { combat } from './combat.ts';
import { explosion, trail } from './effects.ts';
import { reinforce } from './reinforcements.ts';
import { _nb, bHash, gN, kb } from './spatial-hash.ts';
import { killU, spP } from './spawn.ts';
import { steer } from './steering.ts';

export function update(rawDt: number, now: number) {
  const dt = Math.min(rawDt, 0.033);
  bHash();

  for (let i = 0, urem = poolCounts.uC; i < POOL_UNITS && urem > 0; i++) {
    const u = uP[i]!;
    if (!u.alive) continue;
    urem--;
    u.shielded = false;
    steer(u, dt);
    combat(u, i, dt, now);
    u.tT -= dt;
    if (u.tT <= 0) {
      u.tT = 0.03 + Math.random() * 0.02;
      trail(u);
    }
  }

  // Reflector shields
  for (let i = 0, urem2 = poolCounts.uC; i < POOL_UNITS && urem2 > 0; i++) {
    const u = uP[i]!;
    if (!u.alive) continue;
    urem2--;
    if (TYPES[u.type]!.nm !== 'Reflector') continue;
    const nn = gN(u.x, u.y, 100, _nb);
    for (let j = 0; j < nn; j++) {
      const o = uP[_nb[j]!]!;
      if (o.alive && o.team === u.team) o.shielded = true;
    }
  }

  // Projectiles
  for (let i = 0, prem = poolCounts.prC; i < POOL_PROJECTILES && prem > 0; i++) {
    const p = prP[i]!;
    if (!p.alive) continue;
    prem--;

    if (p.hom && p.tx >= 0) {
      const tg = uP[p.tx]!;
      if (tg.alive) {
        let ca = Math.atan2(p.vy, p.vx);
        const da = Math.atan2(tg.y - p.y, tg.x - p.x);
        let diff = da - ca;
        if (diff > PI) diff -= TAU;
        if (diff < -PI) diff += TAU;
        ca += diff * 4 * dt;
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(ca) * sp;
        p.vy = Math.sin(ca) * sp;
      }
      if (Math.random() < 0.5) {
        spP(p.x, p.y, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, 0.12, 1.8, 0.4, 0.4, 0.4, 0);
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (Math.random() < 0.25) {
      spP(
        p.x,
        p.y,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        0.04,
        p.sz * 0.35,
        p.r * 0.5,
        p.g * 0.5,
        p.b * 0.5,
        0,
      );
    }

    if (p.life <= 0) {
      if (p.aoe > 0) {
        const nn = gN(p.x, p.y, p.aoe, _nb);
        for (let j = 0; j < nn; j++) {
          const oi = _nb[j]!,
            o = uP[oi]!;
          if (!o.alive || o.team === p.team) continue;
          const ddx = o.x - p.x,
            ddy = o.y - p.y;
          if (ddx * ddx + ddy * ddy < p.aoe * p.aoe) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            o.hp -= p.dmg * (1 - dd / (p.aoe * 1.2));
            kb(oi, p.x, p.y, 220);
            if (o.hp <= 0) {
              killU(oi);
              explosion(o.x, o.y, o.team, o.type, -1);
            }
          }
        }
        for (let j = 0; j < 16; j++) {
          const a = Math.random() * 6.283;
          spP(
            p.x,
            p.y,
            Math.cos(a) * (40 + Math.random() * 110),
            Math.sin(a) * (40 + Math.random() * 110),
            0.3 + Math.random() * 0.3,
            3 + Math.random() * 3,
            1,
            0.55,
            0.15,
            0,
          );
        }
        spP(p.x, p.y, 0, 0, 0.4, p.aoe * 0.9, 1, 0.5, 0.15, 10);
        addShake(3);
      }
      p.alive = false;
      poolCounts.prC--;
      continue;
    }

    // Hit detection
    const nn2 = gN(p.x, p.y, 30, _nb);
    let hit = false;
    for (let j = 0; j < nn2; j++) {
      const oi = _nb[j]!,
        o = uP[oi]!;
      if (!o.alive || o.team === p.team) continue;
      const hs = TYPES[o.type]!.sz;
      if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) < hs * hs) {
        let dmg = p.dmg;
        if (o.shielded) dmg *= 0.3;
        o.hp -= dmg;
        kb(oi, p.x, p.y, p.dmg * 12);
        spP(p.x, p.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, 0);
        if (o.hp <= 0) {
          killU(oi);
          explosion(o.x, o.y, o.team, o.type, -1);
        }
        p.alive = false;
        poolCounts.prC--;
        hit = true;
        break;
      }
    }

    if (!hit && !catalogOpen) {
      for (let j = 0; j < asteroids.length; j++) {
        const ast = asteroids[j]!;
        if ((p.x - ast.x) * (p.x - ast.x) + (p.y - ast.y) * (p.y - ast.y) < ast.r * ast.r) {
          spP(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.1, 2, 0.6, 0.5, 0.3, 0);
          p.alive = false;
          poolCounts.prC--;
          break;
        }
      }
    }
  }

  // Particles
  for (let i = 0, rem = poolCounts.pC; i < POOL_PARTICLES && rem > 0; i++) {
    const pp = pP[i]!;
    if (!pp.alive) continue;
    rem--;
    pp.x += pp.vx * dt;
    pp.y += pp.vy * dt;
    pp.vx *= 0.97;
    pp.vy *= 0.97;
    pp.life -= dt;
    if (pp.life <= 0) {
      pp.alive = false;
      poolCounts.pC--;
    }
  }

  // Beams
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = beams[i]!;
    bm.life -= dt;
    if (bm.life <= 0) beams.splice(i, 1);
  }

  if (!catalogOpen) {
    // Base damage
    if (gameMode === 2) {
      for (let i = 0, urem3 = poolCounts.uC; i < POOL_UNITS && urem3 > 0; i++) {
        const u = uP[i]!;
        if (!u.alive) continue;
        urem3--;
        const eb = bases[u.team === 0 ? 1 : 0];
        const d = Math.sqrt((u.x - eb.x) * (u.x - eb.x) + (u.y - eb.y) * (u.y - eb.y));
        if (d < 80) {
          eb.hp -= TYPES[u.type]!.dmg * dt * 3;
          if (eb.hp < 0) eb.hp = 0;
        }
      }
    }

    for (let i = 0; i < asteroids.length; i++) {
      const ast = asteroids[i]!;
      ast.ang += ast.va * dt;
    }
    reinforce(dt);

    // Win checks
    if (gameMode === 1) {
      let ac = 0,
        bc = 0;
      for (let i = 0, urem4 = poolCounts.uC; i < POOL_UNITS && urem4 > 0; i++) {
        const u = uP[i]!;
        if (!u.alive) continue;
        urem4--;
        if (u.team === 0) ac++;
        else bc++;
      }
      if (ac === 0 || bc === 0) {
        setWinTeam(ac === 0 ? 1 : 0);
        showWin();
      }
    }
    if (gameMode === 2) {
      if (bases[0].hp <= 0) {
        setWinTeam(1);
        showWin();
      } else if (bases[1].hp <= 0) {
        setWinTeam(0);
        showWin();
      }
    }
  } else {
    updateCatDemo(dt);
  }
}
