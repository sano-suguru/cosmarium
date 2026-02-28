import { unit } from '../pools.ts';
import type { Unit } from '../types.ts';
import { NO_UNIT } from '../types.ts';

// GC回避: aimAt() の結果を再利用するシングルトン
const _aim = { ang: 0, dist: 0 };

/** 二次方程式 at²+bt+c=0 の最小正の実数解。解なしなら -1 */
function smallestPositiveRoot(a: number, b: number, c: number): number {
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;

  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return -1;
    const t = -c / b;
    return t > 0 ? t : -1;
  }
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t1 > 0 && t2 > 0) return Math.min(t1, t2);
  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return -1;
}

function setDirect(ang: number, dist: number): { ang: number; dist: number } {
  _aim.ang = ang;
  _aim.dist = dist;
  return _aim;
}

/**
 * 偏差射撃を考慮した照準角度と予測距離を返す。
 * 二次方程式でインターセプト地点を求め、accuracy (0–1) で直射とブレンドする。
 */
export function aimAt(
  ux: number,
  uy: number,
  ox: number,
  oy: number,
  ovx: number,
  ovy: number,
  speed: number,
  accuracy: number,
): { ang: number; dist: number } {
  const dx = ox - ux;
  const dy = oy - uy;
  const directAng = Math.atan2(dy, dx);
  const directDist = Math.sqrt(dx * dx + dy * dy);

  if (accuracy <= 0 || speed <= 0) return setDirect(directAng, directDist);

  // |P + V*t|² = (s*t)²  →  (V²-s²)t² + 2(P·V)t + P·P = 0
  const t = smallestPositiveRoot(ovx * ovx + ovy * ovy - speed * speed, 2 * (dx * ovx + dy * ovy), dx * dx + dy * dy);
  if (t <= 0) return setDirect(directAng, directDist);

  const px = dx + ovx * t;
  const py = dy + ovy * t;
  const leadAng = Math.atan2(py, px);
  const leadDist = Math.sqrt(px * px + py * py);

  // ±π境界を超えると逆方向に回るため最短弧で補間
  let angleDiff = leadAng - directAng;
  if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  _aim.ang = directAng + angleDiff * accuracy;
  _aim.dist = directDist + (leadDist - directDist) * accuracy;
  return _aim;
}

export function tgtDistOrClear(u: Unit): number {
  if (u.target === NO_UNIT) return -1;
  const o = unit(u.target);
  if (!o.alive) {
    u.target = NO_UNIT;
    return -1;
  }
  return Math.sqrt((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y));
}

export function swarmDmgMul(u: Unit): number {
  return 1 + u.swarmN * 0.15;
}
