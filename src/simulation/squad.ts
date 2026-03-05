import { POOL_SQUADS, SQUADS_PER_TEAM } from '../constants.ts';

const SQUAD_MAX_SIZE = 20;
const SQUAD_COHESION_DIST = 80;
const SQUAD_COHESION_RANGE = 300;
const SQUAD_COHESION_WEIGHT = 2.5;
const SQUAD_LEASH_DIST = 350;
const SQUAD_LEASH_MAX = 500;
const SQUAD_OBJECTIVE_MIN = 5.0;
const SQUAD_OBJECTIVE_MAX = 10.0;
const SQUAD_OBJECTIVE_SCATTER = 200;

import { squad, unit } from '../pools.ts';
import type { Squad, SquadIndex, Team, Unit, UnitIndex } from '../types.ts';
import { NO_SQUAD, NO_UNIT } from '../types.ts';
import { unitType } from '../unit-types.ts';
import { nearestEnemyCenter, teamCenterOf } from './team-center.ts';

/** チーム内で最少メンバーの分隊を返す（空きスロットは0メンバーとして扱い均等配分） */
function findSquadForTeam(team: Team): SquadIndex {
  let minCount = SQUAD_MAX_SIZE;
  let minIdx: SquadIndex = NO_SQUAD;

  const base = team * SQUADS_PER_TEAM;
  for (let i = 0; i < SQUADS_PER_TEAM; i++) {
    const si = (base + i) as SquadIndex;
    const s = squad(si);
    const count = s.alive ? s.memberCount : 0;
    if (count < minCount) {
      minCount = count;
      minIdx = si;
    }
  }
  return minIdx;
}

/** 新規分隊を初期化する。objectiveTimer はインデックスから決定論的に散布する */
function initSquad(si: SquadIndex, team: Team, leader: UnitIndex): void {
  const s = squad(si);
  s.alive = true;
  s.team = team;
  s.leader = leader;
  s.objectiveX = 0;
  s.objectiveY = 0;
  s.objectiveTimer = (((si % SQUADS_PER_TEAM) + 0.5) / SQUADS_PER_TEAM) * (SQUAD_OBJECTIVE_MAX - SQUAD_OBJECTIVE_MIN);
  s.memberCount = 0;
}

/** ユニットを分隊に配属する。全分隊満員なら配属をスキップする */
export function assignToSquad(unitIdx: UnitIndex, team: Team): void {
  const si = findSquadForTeam(team);
  if (si === NO_SQUAD) {
    return;
  }
  const s = squad(si);

  if (!s.alive) {
    initSquad(si, team, unitIdx);
  }

  unit(unitIdx).squadIdx = si;
  s.memberCount++;

  if (s.leader === NO_UNIT || !unit(s.leader).alive) {
    s.leader = unitIdx;
  }
}

/** Battle/Melee 開始時: チームの全生存ユニットを分隊に均等配分する */
export function formSquads(team: Team, unitHWM: number): void {
  const base = team * SQUADS_PER_TEAM;
  for (let i = 0; i < SQUADS_PER_TEAM; i++) {
    const s = squad(base + i);
    s.alive = false;
    s.memberCount = 0;
  }

  for (let i = 0; i < unitHWM; i++) {
    const u = unit(i);
    if (!u.alive || u.team !== team) {
      continue;
    }
    assignToSquad(i as UnitIndex, team);
  }
}

/** リーダー死亡時に最大 mass の生存メンバーを新リーダーに昇格させる */
export function succeedLeader(si: SquadIndex, unitHWM: number): void {
  const s = squad(si);
  if (!s.alive) {
    return;
  }

  let bestIdx: UnitIndex = NO_UNIT;
  let bestMass = -1;
  for (let i = 0; i < unitHWM; i++) {
    const u = unit(i);
    if (u.alive && u.squadIdx === si) {
      const mass = unitType(u.type).mass;
      if (mass > bestMass) {
        bestMass = mass;
        bestIdx = i as UnitIndex;
      }
    }
  }
  s.leader = bestIdx;
}

/** killUnit フック: 死亡ユニットの分隊メンバーカウントを減らし、リーダーなら継承処理 */
export function onUnitKilled(squadIdx: SquadIndex, victimIdx: UnitIndex, unitHWM: number): void {
  if (squadIdx === NO_SQUAD) {
    return;
  }

  const s = squad(squadIdx);
  s.memberCount--;

  if (s.leader === victimIdx) {
    s.leader = NO_UNIT;
    succeedLeader(squadIdx, unitHWM);
  }

  if (s.memberCount <= 0) {
    s.alive = false;
    s.leader = NO_UNIT;
  }
}

/** 全スクアッドの目標タイマーを更新し、期限切れなら新目標を設定する */
export function updateSquadObjectives(dt: number, rng: () => number): void {
  for (let si = 0; si < POOL_SQUADS; si++) {
    const s = squad(si);
    if (!s.alive) {
      continue;
    }

    s.objectiveTimer -= dt;
    if (s.objectiveTimer > 0) {
      continue;
    }

    // リーダーの位置から最寄り敵チーム重心を取得。リーダー不在時は自チーム重心を基点にする
    const leader = s.leader !== NO_UNIT ? unit(s.leader) : null;
    let lx: number;
    let ly: number;
    if (leader?.alive) {
      lx = leader.x;
      ly = leader.y;
    } else {
      const tc = teamCenterOf(s.team);
      if (!tc) {
        continue;
      }
      lx = tc.x;
      ly = tc.y;
    }
    const centroid = nearestEnemyCenter(s.team, lx, ly);
    if (!centroid) {
      continue;
    }
    s.objectiveX = centroid.x + (rng() - 0.5) * SQUAD_OBJECTIVE_SCATTER;
    s.objectiveY = centroid.y + (rng() - 0.5) * SQUAD_OBJECTIVE_SCATTER;
    s.objectiveTimer = SQUAD_OBJECTIVE_MIN + rng() * (SQUAD_OBJECTIVE_MAX - SQUAD_OBJECTIVE_MIN);
  }
}

/** メンバーの分隊リーダー UnitIndex を返す。未所属・自身がリーダー・リーダー死亡時は NO_UNIT */
function memberLeaderIdx(u: Unit, ui: UnitIndex): UnitIndex {
  const si = u.squadIdx;
  if (si === NO_SQUAD) {
    return NO_UNIT;
  }
  const s = squad(si);
  if (!s.alive || s.leader === NO_UNIT || s.leader === ui) {
    return NO_UNIT;
  }
  return unit(s.leader).alive ? s.leader : NO_UNIT;
}

/** メンバー → リーダーへの追従力（デッドゾーン付き二次）。結果は out に書き込まれる */
export function computeSquadCohesion(u: Unit, ui: UnitIndex, out: { x: number; y: number }): void {
  const li = memberLeaderIdx(u, ui);
  if (li === NO_UNIT) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const leader = unit(li);

  const dx = leader.x - u.x;
  const dy = leader.y - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= SQUAD_COHESION_DIST) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const excess = dist - SQUAD_COHESION_DIST;
  const t = Math.min(excess / (SQUAD_COHESION_RANGE - SQUAD_COHESION_DIST), 1);
  const force = t * t * unitType(u.type).speed * SQUAD_COHESION_WEIGHT;
  const inv = 1 / dist;
  out.x = dx * inv * force;
  out.y = dy * inv * force;
}

/** リーダーからの距離に応じた交戦力減衰ファクター（0〜1）。リーシュ距離超過で減衰し、最大距離で 0 */
export function computeSquadLeashFactor(u: Unit, ui: UnitIndex): number {
  const li = memberLeaderIdx(u, ui);
  if (li === NO_UNIT) {
    return 1;
  }
  const leader = unit(li);

  const dx = leader.x - u.x;
  const dy = leader.y - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= SQUAD_LEASH_DIST) {
    return 1;
  }
  if (dist >= SQUAD_LEASH_MAX) {
    return 0;
  }
  return 1 - (dist - SQUAD_LEASH_DIST) / (SQUAD_LEASH_MAX - SQUAD_LEASH_DIST);
}

/** リーダーかつ非戦闘時に分隊目標への seek 力を out に書き込む */
export function computeSquadLeaderObjective(
  u: Unit,
  ui: UnitIndex,
  hasTarget: boolean,
  speed: number,
  out: { x: number; y: number },
): void {
  if (hasTarget || u.squadIdx === NO_SQUAD) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const s = squad(u.squadIdx);
  if (!s.alive || s.leader !== ui) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const dx = s.objectiveX - u.x;
  const dy = s.objectiveY - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const inv = 1 / dist;
  out.x = dx * inv * speed;
  out.y = dy * inv * speed;
}

const _squadSnapshot: Squad[] = [];

export function snapshotSquads(): void {
  for (let i = 0; i < POOL_SQUADS; i++) {
    const s = squad(i);
    const existing = _squadSnapshot[i];
    if (existing === undefined) {
      _squadSnapshot[i] = { ...s };
    } else {
      Object.assign(existing, s);
    }
  }
}

export function restoreSquads(): void {
  for (let i = 0; i < POOL_SQUADS; i++) {
    const snap = _squadSnapshot[i];
    if (snap !== undefined) {
      Object.assign(squad(i), snap);
    }
  }
}

/** テザー描画対象のリーダーを返す。リーダー自身・未所属・リーダー死亡時は NO_UNIT */
export function getSquadTetherTarget(u: Unit, i: UnitIndex): UnitIndex {
  return memberLeaderIdx(u, i);
}
