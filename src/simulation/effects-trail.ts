import { trailColor } from '../colors.ts';
import { REF_FPS, SH_CIRCLE, SH_TRAIL, TAU } from '../constants.ts';
import type { Unit } from '../types.ts';
import { FLAGSHIP_ENGINE_OFFSETS, unitType } from '../unit-type-accessors.ts';
import { spawnParticle } from './spawn.ts';

export function trail(u: Unit, rng: () => number) {
  const t = unitType(u.type),
    c = trailColor(u.type, u.team);
  const bx = u.x - Math.cos(u.angle) * t.size * 0.8;
  const by = u.y - Math.sin(u.angle) * t.size * 0.8;
  spawnParticle(
    bx + (rng() - 0.5) * t.size * 0.3,
    by + (rng() - 0.5) * t.size * 0.3,
    -Math.cos(u.angle) * 25 + (rng() - 0.5) * 15,
    -Math.sin(u.angle) * 25 + (rng() - 0.5) * 15,
    0.1 + rng() * 0.22 * t.trailInterval,
    t.size * 0.3 + rng() * 1.5,
    c[0],
    c[1],
    c[2],
    SH_TRAIL,
  );
}

const ENGINE_SKIP_CHANCE = 0.45;

export function flagshipTrail(u: Unit, rng: () => number) {
  const t = unitType(u.type),
    c = trailColor(u.type, u.team);
  const cos = Math.cos(u.angle);
  const sin = Math.sin(u.angle);
  const engineRearOffset = -(t.size * 1.05); // シェーダノズル0.80より奥
  for (const sign of [-1, 1] as const) {
    for (const ey of FLAGSHIP_ENGINE_OFFSETS) {
      if (rng() < ENGINE_SKIP_CHANCE) {
        continue;
      }
      const localY = sign * ey * t.size;
      const wx = u.x + cos * engineRearOffset - sin * localY;
      const wy = u.y + sin * engineRearOffset + cos * localY;
      spawnParticle(
        wx + (rng() - 0.5) * t.size * 0.15,
        wy + (rng() - 0.5) * t.size * 0.15,
        -cos * 40 + (rng() - 0.5) * 20,
        -sin * 40 + (rng() - 0.5) * 20,
        0.12 + rng() * 0.2 * t.trailInterval,
        t.size * 0.18 + rng() * 1.5,
        c[0],
        c[1],
        c[2],
        SH_TRAIL,
      );
    }
  }
}

export function boostBurst(u: Unit, rng: () => number) {
  const t = unitType(u.type);
  const c = trailColor(u.type, u.team);
  const bx = u.x - Math.cos(u.angle) * t.size * 0.8;
  const by = u.y - Math.sin(u.angle) * t.size * 0.8;

  for (let i = 0; i < 10; i++) {
    const angle = i * (TAU / 10) + rng() * 0.3;
    const speed = 60 + rng() * 40;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = 0.15 + rng() * 0.1;
    const size = t.size * 0.4 + rng() * 2;
    spawnParticle(bx, by, vx, vy, life, size, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, SH_CIRCLE);
  }
}

export function boostTrail(u: Unit, dt: number, rng: () => number) {
  if (rng() < 1 - 0.6 ** (dt * REF_FPS)) {
    const t = unitType(u.type);
    const c = trailColor(u.type, u.team);
    const cos = Math.cos(u.angle);
    const sin = Math.sin(u.angle);
    const ox = u.x - cos * t.size * 0.8 + (rng() - 0.5) * t.size * 0.5;
    const oy = u.y - sin * t.size * 0.8 + (rng() - 0.5) * t.size * 0.5;
    const vx = -cos * 40 + (rng() - 0.5) * 20;
    const vy = -sin * 40 + (rng() - 0.5) * 20;
    const life = 0.08 + rng() * 0.12;
    const size = t.size * 0.5 + rng() * 2;
    spawnParticle(ox, oy, vx, vy, life, size, c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5, SH_CIRCLE);
  }
}
