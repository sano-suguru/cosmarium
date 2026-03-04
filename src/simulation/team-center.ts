import { getUnitHWM, poolCounts, unit } from '../pools.ts';
import type { Team } from '../types.ts';
import { MAX_TEAMS } from '../types.ts';

/** チームごとの重心座標。count === 0 の場合 x, y は無意味 */
interface TeamCenter {
  x: number;
  y: number;
  count: number;
}

const centers: TeamCenter[] = Array.from({ length: MAX_TEAMS }, () => ({ x: 0, y: 0, count: 0 }));

/** noUncheckedIndexedAccess 対応アクセサ。範囲外なら例外 */
function center(t: number): TeamCenter {
  const c = centers[t];
  if (c === undefined) {
    throw new RangeError(`Invalid team index: ${t}`);
  }
  return c;
}

let _activeTeamCount = MAX_TEAMS;

// ---------------------------------------------------------------------------
// 3-phase API: buildHash() から呼び出され、重複 O(N) スキャンを回避する
// ---------------------------------------------------------------------------

/** フェーズ1: 全 MAX_TEAMS 分の重心をゼロリセット */
export function beginTeamCenterUpdate(): void {
  for (let t = 0; t < MAX_TEAMS; t++) {
    const c = center(t);
    c.x = 0;
    c.y = 0;
    c.count = 0;
  }
}

/** フェーズ2: 1ユニット分の座標を該当チームに蓄積 */
export function accumulateUnit(team: number, x: number, y: number): void {
  const c = center(team);
  c.x += x;
  c.y += y;
  c.count++;
}

/** フェーズ3: 全 MAX_TEAMS 分の重心を正規化し、activeTeamCount を設定 */
export function endTeamCenterUpdate(activeTeamCount: number): void {
  _activeTeamCount = activeTeamCount;
  for (let t = 0; t < MAX_TEAMS; t++) {
    const c = center(t);
    if (c.count > 0) {
      c.x /= c.count;
      c.y /= c.count;
    }
  }
}

// ---------------------------------------------------------------------------
// コンビニエンス関数（テスト用: 単体で重心を計算する）
// ---------------------------------------------------------------------------

/**
 * 全 alive ユニットを走査し、チームごとの重心 (center of mass) を更新する。
 * テストで使用。本番では buildHash() 内の3フェーズ呼び出しで代替。
 */
export function updateTeamCenters(activeTeamCount: number): void {
  beginTeamCenterUpdate();
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    accumulateUnit(u.team, u.x, u.y);
  }
  endTeamCenterUpdate(activeTeamCount);
}

/**
 * 指定チームの重心を返す。ユニットが存在しなければ null。
 * 戻り値は内部バッファへの直接参照。即座に読み取ること（次の updateTeamCenters() で上書きされる）。
 */
export function teamCenterOf(team: Team): { x: number; y: number } | null {
  if (team >= _activeTeamCount) {
    return null;
  }
  const c = center(team);
  return c.count > 0 ? c : null;
}

/**
 * (ux, uy) から最も近い敵チーム（team !== myTeam）の重心座標を返す。
 * 敵チームが存在しなければ null。
 * 戻り値は内部バッファへの直接参照。即座に読み取ること（次の updateTeamCenters() で上書きされる）。
 */
export function nearestEnemyCenter(myTeam: Team, ux: number, uy: number): { x: number; y: number } | null {
  let bestD2 = Number.POSITIVE_INFINITY;
  let best: TeamCenter | null = null;
  for (let t = 0; t < _activeTeamCount; t++) {
    if (t === myTeam) {
      continue;
    }
    const c = center(t);
    if (c.count === 0) {
      continue;
    }
    const dx = c.x - ux;
    const dy = c.y - uy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = c;
    }
  }
  return best;
}

/** テスト用: 重心をリセットする */
export function resetTeamCenters(): void {
  _activeTeamCount = MAX_TEAMS;
  for (let t = 0; t < MAX_TEAMS; t++) {
    const c = center(t);
    c.x = 0;
    c.y = 0;
    c.count = 0;
  }
}
