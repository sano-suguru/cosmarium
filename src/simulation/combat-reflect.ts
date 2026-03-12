import { REF_FPS, SH_CIRCLE, SH_EXPLOSION_RING } from '../constants.ts';
import { getProjectileHWM, poolCounts } from '../pools.ts';
import { projectile, unit } from '../pools-query.ts';
import type { Team } from '../team.ts';
import type { Color3, ReflectableProjectile, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { aimAt } from './combat-aim.ts';
import { consumeReflectorShieldHp } from './combat-beam-defense.ts';
import type { CombatContext } from './combat-context.ts';
import { spawnParticle, spawnProjectile } from './spawn.ts';
import { addBeam } from './spawn-beams.ts';

const REFLECTOR_WEAK_SHOT_SPEED = 400;
const REFLECT_RADIUS_MULT = 3;
const REFLECT_SCATTER_FULL = (30 * Math.PI) / 180;
const REFLECT_SPEED_MULT = 1.0;
const REFLECT_LIFE = 0.5;

/** 同一フレーム内で反射済みのプロジェクタイルインデックス。対向リフレクター間の無限バウンスを防止 */
const reflectedThisFrame = new Set<number>();

export function resetReflected() {
  reflectedThisFrame.clear();
}

interface ReflectOpts {
  readonly team: Team;
  readonly color: Color3;
  readonly reflectorType: UnitTypeIndex;
  readonly reflectorIndex: UnitIndex;
}

/**
 * Reflector による弾の鏡面反射+散乱。弾の速度・チーム・色を書き換える。
 * @param rng 決定論的乱数（散乱角・パーティクルに使用）
 * @param ux Reflector の X 座標（反射法線の原点）
 * @param uy Reflector の Y 座標
 * @param p 反射対象（vx/vy/life/team/色/sourceType/sourceUnit を上書きし、homing/aoe/target をリセット）
 * @param opts 反射先チーム・色・リフレクター情報
 */
export function reflectProjectile(
  rng: () => number,
  ux: number,
  uy: number,
  p: ReflectableProjectile,
  opts: ReflectOpts,
) {
  let dx = p.x - ux;
  let dy = p.y - uy;
  let nd = Math.sqrt(dx * dx + dy * dy);
  if (nd < 0.001) {
    dx = -p.vx;
    dy = -p.vy;
    nd = Math.sqrt(dx * dx + dy * dy) || 1;
  }
  const nx = dx / nd;
  const ny = dy / nd;
  // v' = v - 2(v·n)n
  const dot = p.vx * nx + p.vy * ny;
  const rvx = p.vx - 2 * dot * nx;
  const rvy = p.vy - 2 * dot * ny;
  const scatter = (rng() - 0.5) * REFLECT_SCATTER_FULL;
  const cs = Math.cos(scatter);
  const sn = Math.sin(scatter);
  p.vx = (rvx * cs - rvy * sn) * REFLECT_SPEED_MULT;
  p.vy = (rvx * sn + rvy * cs) * REFLECT_SPEED_MULT;
  p.life = REFLECT_LIFE;
  // 反射弾は反射ユニットのチームに帰属する（分析統計でもReflectorのダメージとして計上）
  const { team, color: c, reflectorType, reflectorIndex } = opts;
  p.team = team;
  p.r = c[0];
  p.g = c[1];
  p.b = c[2];
  // 再反射時も最後に反射したユニットの型に更新（ダメージ統計・キル帰属の正確性のため）
  p.sourceType = reflectorType;
  p.sourceUnit = reflectorIndex;
  // 反射時にホーミング・AOE・ターゲットをリセット（元の味方に追尾/範囲ダメージを与えないため）
  p.homing = false;
  p.aoe = 0;
  p.target = NO_UNIT;
  addBeam(ux, uy, p.x, p.y, c[0], c[1], c[2], 0.15, 1.5);
  for (let j = 0; j < 4; j++) {
    spawnParticle(p.x, p.y, (rng() - 0.5) * 80, (rng() - 0.5) * 80, 0.15, 3 + rng() * 2, c[0], c[1], c[2], SH_CIRCLE);
  }
  spawnParticle(p.x, p.y, 0, 0, 0.12, 10, 1, 1, 1, SH_EXPLOSION_RING);
}

/** 反射対象のプロジェクタイルか判定（同チーム・反射済み・範囲外を除外） */
function isReflectCandidate(
  p: ReturnType<typeof projectile>,
  pIdx: number,
  ux: number,
  uy: number,
  reflectRSq: number,
  team: Team,
): boolean {
  if (reflectedThisFrame.has(pIdx)) {
    return false;
  }
  if (p.team === team) {
    return false;
  }
  const dx = p.x - ux;
  const dy = p.y - uy;
  return dx * dx + dy * dy < reflectRSq;
}

function reflectNearbyProjectiles(ctx: CombatContext, u: CombatContext['u'], reflectR: number, team: Team, c: Color3) {
  const cooldown = ctx.t.shieldCooldown;
  const reflectRSq = reflectR * reflectR;
  for (let i = 0, rem = poolCounts.projectiles; i < getProjectileHWM() && rem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) {
      continue;
    }
    rem--;
    if (!isReflectCandidate(p, i, u.x, u.y, reflectRSq, team)) {
      continue;
    }
    if (u.energy <= 0 || u.shieldCooldown > 0) {
      break;
    }
    consumeReflectorShieldHp(u, p.damage, cooldown);
    reflectProjectile(ctx.rng, u.x, u.y, p, { team, color: c, reflectorType: u.type, reflectorIndex: ctx.ui });
    reflectedThisFrame.add(i);
  }
}

/** Reflector の弱射撃（プロジェクタイル反射不能時のサブ攻撃） */
function fireWeakShot(ctx: CombatContext): void {
  const { u, c, t, vd } = ctx;
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return;
  }
  const dx = o.x - u.x,
    dy = o.y - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= t.range) {
    return;
  }
  u.cooldown = t.fireRate;
  const aim = aimAt(u.x, u.y, o.x, o.y, o.vx, o.vy, REFLECTOR_WEAK_SHOT_SPEED, t.leadAccuracy);
  spawnProjectile(
    u.x,
    u.y,
    Math.cos(aim.ang) * REFLECTOR_WEAK_SHOT_SPEED,
    Math.sin(aim.ang) * REFLECTOR_WEAK_SHOT_SPEED,
    aim.dist / REFLECTOR_WEAK_SHOT_SPEED + 0.1,
    t.damage * vd,
    u.team,
    1.5,
    c[0],
    c[1],
    c[2],
    { sourceUnit: ctx.ui },
  );
}

export function reflectProjectiles(ctx: CombatContext) {
  const { u, c, t } = ctx;
  const fireRange = t.range;
  const reflectR = t.size * REFLECT_RADIUS_MULT;
  if (u.shieldCooldown <= 0 && u.energy > 0) {
    reflectNearbyProjectiles(ctx, u, reflectR, u.team, c);
  }
  if (u.cooldown <= 0 && u.target !== NO_UNIT) {
    fireWeakShot(ctx);
  }
  if (ctx.rng() < 1 - 0.9 ** (ctx.dt * REF_FPS)) {
    spawnParticle(
      u.x + (ctx.rng() - 0.5) * fireRange * 1.5,
      u.y + (ctx.rng() - 0.5) * fireRange * 1.5,
      0,
      0,
      0.15,
      2,
      c[0] * 0.5,
      c[1] * 0.5,
      c[2] * 0.5,
      SH_CIRCLE,
    );
  }
}
