import { PI, POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS, TAU } from '../constants.ts';
import { addShake } from '../input/camera.ts';
import { particlePool, poolCounts, projectilePool, unitPool } from '../pools.ts';
import { asteroids, bases, beams, catalogOpen, gameMode, setWinTeam } from '../state.ts';
import { updateCatDemo } from '../ui/catalog.ts';
import { showWin } from '../ui/game-control.ts';
import { TYPES } from '../unit-types.ts';
import { combat } from './combat.ts';
import { explosion, trail } from './effects.ts';
import { reinforce } from './reinforcements.ts';
import { buildHash, getNeighbors, knockback, neighborBuffer } from './spatial-hash.ts';
import { killUnit, spawnParticle } from './spawn.ts';
import { steer } from './steering.ts';

export function update(rawDt: number, now: number) {
  const dt = Math.min(rawDt, 0.033);
  buildHash();

  for (let i = 0, urem = poolCounts.unitCount; i < POOL_UNITS && urem > 0; i++) {
    const u = unitPool[i]!;
    if (!u.alive) continue;
    urem--;
    u.shielded = false;
    steer(u, dt);
    combat(u, i, dt, now);
    u.trailTimer -= dt;
    if (u.trailTimer <= 0) {
      u.trailTimer = 0.03 + Math.random() * 0.02;
      trail(u);
    }
  }

  // Reflector shields
  for (let i = 0, urem2 = poolCounts.unitCount; i < POOL_UNITS && urem2 > 0; i++) {
    const u = unitPool[i]!;
    if (!u.alive) continue;
    urem2--;
    if (TYPES[u.type]!.name !== 'Reflector') continue;
    const nn = getNeighbors(u.x, u.y, 100, neighborBuffer);
    for (let j = 0; j < nn; j++) {
      const o = unitPool[neighborBuffer[j]!]!;
      if (o.alive && o.team === u.team) o.shielded = true;
    }
  }

  // Projectiles
  for (let i = 0, prem = poolCounts.projectileCount; i < POOL_PROJECTILES && prem > 0; i++) {
    const p = projectilePool[i]!;
    if (!p.alive) continue;
    prem--;

    if (p.homing && p.targetIndex >= 0) {
      const tg = unitPool[p.targetIndex]!;
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
        spawnParticle(p.x, p.y, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, 0.12, 1.8, 0.4, 0.4, 0.4, 0);
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (Math.random() < 0.25) {
      spawnParticle(
        p.x,
        p.y,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        0.04,
        p.size * 0.35,
        p.r * 0.5,
        p.g * 0.5,
        p.b * 0.5,
        0,
      );
    }

    if (p.life <= 0) {
      if (p.aoe > 0) {
        const nn = getNeighbors(p.x, p.y, p.aoe, neighborBuffer);
        for (let j = 0; j < nn; j++) {
          const oi = neighborBuffer[j]!,
            o = unitPool[oi]!;
          if (!o.alive || o.team === p.team) continue;
          const ddx = o.x - p.x,
            ddy = o.y - p.y;
          if (ddx * ddx + ddy * ddy < p.aoe * p.aoe) {
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            o.hp -= p.damage * (1 - dd / (p.aoe * 1.2));
            knockback(oi, p.x, p.y, 220);
            if (o.hp <= 0) {
              killUnit(oi);
              explosion(o.x, o.y, o.team, o.type, -1);
            }
          }
        }
        for (let j = 0; j < 16; j++) {
          const a = Math.random() * 6.283;
          spawnParticle(
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
        spawnParticle(p.x, p.y, 0, 0, 0.4, p.aoe * 0.9, 1, 0.5, 0.15, 10);
        addShake(3);
      }
      p.alive = false;
      poolCounts.projectileCount--;
      continue;
    }

    // Hit detection
    const nn2 = getNeighbors(p.x, p.y, 30, neighborBuffer);
    let hit = false;
    for (let j = 0; j < nn2; j++) {
      const oi = neighborBuffer[j]!,
        o = unitPool[oi]!;
      if (!o.alive || o.team === p.team) continue;
      const hs = TYPES[o.type]!.size;
      if ((o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) < hs * hs) {
        let dmg = p.damage;
        if (o.shielded) dmg *= 0.3;
        o.hp -= dmg;
        knockback(oi, p.x, p.y, p.damage * 12);
        spawnParticle(p.x, p.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.06, 2, 1, 1, 0.7, 0);
        if (o.hp <= 0) {
          killUnit(oi);
          explosion(o.x, o.y, o.team, o.type, -1);
        }
        p.alive = false;
        poolCounts.projectileCount--;
        hit = true;
        break;
      }
    }

    if (!hit && !catalogOpen) {
      for (let j = 0; j < asteroids.length; j++) {
        const ast = asteroids[j]!;
        if ((p.x - ast.x) * (p.x - ast.x) + (p.y - ast.y) * (p.y - ast.y) < ast.radius * ast.radius) {
          spawnParticle(p.x, p.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.1, 2, 0.6, 0.5, 0.3, 0);
          p.alive = false;
          poolCounts.projectileCount--;
          break;
        }
      }
    }
  }

  // Particles
  for (let i = 0, rem = poolCounts.particleCount; i < POOL_PARTICLES && rem > 0; i++) {
    const pp = particlePool[i]!;
    if (!pp.alive) continue;
    rem--;
    pp.x += pp.vx * dt;
    pp.y += pp.vy * dt;
    pp.vx *= 0.97;
    pp.vy *= 0.97;
    pp.life -= dt;
    if (pp.life <= 0) {
      pp.alive = false;
      poolCounts.particleCount--;
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
      for (let i = 0, urem3 = poolCounts.unitCount; i < POOL_UNITS && urem3 > 0; i++) {
        const u = unitPool[i]!;
        if (!u.alive) continue;
        urem3--;
        const eb = bases[u.team === 0 ? 1 : 0];
        const d = Math.sqrt((u.x - eb.x) * (u.x - eb.x) + (u.y - eb.y) * (u.y - eb.y));
        if (d < 80) {
          eb.hp -= TYPES[u.type]!.damage * dt * 3;
          if (eb.hp < 0) eb.hp = 0;
        }
      }
    }

    for (let i = 0; i < asteroids.length; i++) {
      const ast = asteroids[i]!;
      ast.angle += ast.angularVelocity * dt;
    }
    reinforce(dt);

    // Win checks
    if (gameMode === 1) {
      let ac = 0,
        bc = 0;
      for (let i = 0, urem4 = poolCounts.unitCount; i < POOL_UNITS && urem4 > 0; i++) {
        const u = unitPool[i]!;
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
