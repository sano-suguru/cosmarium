import { POOL_SQUADRONS, SQUADRONS_PER_TEAM } from '../constants.ts';

const SQUADRON_MAX_SIZE = 20;
const SQUADRON_COHESION_DIST = 80;
const SQUADRON_COHESION_RANGE = 300;
const SQUADRON_COHESION_WEIGHT = 2.5;
const SQUADRON_LEASH_DIST = 350;
const SQUADRON_LEASH_MAX = 500;
const SQUADRON_OBJECTIVE_MIN = 5.0;
const SQUADRON_OBJECTIVE_MAX = 10.0;
const SQUADRON_OBJECTIVE_SCATTER = 200;

import { squadronIdx, unitIdx } from '../pool-index.ts';
import { squadron, unit } from '../pools-query.ts';
import type { Team } from '../team.ts';
import type { Squadron, SquadronIndex, Unit, UnitIndex } from '../types.ts';
import { NO_SQUADRON, NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import { nearestEnemyCenter, teamCenterOf } from './team-center.ts';

/** チーム内で最少メンバーの分隊を返す（空きスロットは0メンバーとして扱い均等配分） */
function findSquadronForTeam(team: Team): SquadronIndex {
  let minCount = SQUADRON_MAX_SIZE;
  let minIdx: SquadronIndex = NO_SQUADRON;

  const base = team * SQUADRONS_PER_TEAM;
  for (let i = 0; i < SQUADRONS_PER_TEAM; i++) {
    const si = squadronIdx(base + i);
    const s = squadron(si);
    const count = s.alive ? s.memberCount : 0;
    if (count < minCount) {
      minCount = count;
      minIdx = si;
    }
  }
  return minIdx;
}

/** 新規分隊を初期化する。objectiveTimer はインデックスから決定論的に散布する */
function initSquadron(si: SquadronIndex, team: Team, leader: UnitIndex): void {
  const s = squadron(si);
  s.alive = true;
  s.team = team;
  s.leader = leader;
  s.objectiveX = 0;
  s.objectiveY = 0;
  s.objectiveTimer =
    (((si % SQUADRONS_PER_TEAM) + 0.5) / SQUADRONS_PER_TEAM) * (SQUADRON_OBJECTIVE_MAX - SQUADRON_OBJECTIVE_MIN);
  s.memberCount = 0;
}

/** ユニットを分隊に配属する。全分隊満員なら配属をスキップする */
export function assignToSquadron(unitIdx: UnitIndex, team: Team): void {
  const si = findSquadronForTeam(team);
  if (si === NO_SQUADRON) {
    return;
  }
  const s = squadron(si);

  if (!s.alive) {
    initSquadron(si, team, unitIdx);
  }

  unit(unitIdx).squadronIdx = si;
  s.memberCount++;

  if (s.leader === NO_UNIT || !unit(s.leader).alive) {
    s.leader = unitIdx;
  }
}

/** Battle/Melee 開始時: チームの全生存ユニットを分隊に均等配分する */
export function formSquadrons(team: Team, unitHWM: number): void {
  const base = team * SQUADRONS_PER_TEAM;
  for (let i = 0; i < SQUADRONS_PER_TEAM; i++) {
    const s = squadron(base + i);
    s.alive = false;
    s.memberCount = 0;
  }

  for (let i = 0; i < unitHWM; i++) {
    const u = unit(i);
    if (!u.alive || u.team !== team) {
      continue;
    }
    assignToSquadron(unitIdx(i), team);
  }
}

/** リーダー死亡時に最大 mass の生存メンバーを新リーダーに昇格させる */
export function succeedLeader(si: SquadronIndex, unitHWM: number): void {
  const s = squadron(si);
  if (!s.alive) {
    return;
  }

  let bestIdx: UnitIndex = NO_UNIT;
  let bestMass = -1;
  for (let i = 0; i < unitHWM; i++) {
    const u = unit(i);
    if (u.alive && u.squadronIdx === si) {
      const mass = unitType(u.type).mass;
      if (mass > bestMass) {
        bestMass = mass;
        bestIdx = unitIdx(i);
      }
    }
  }
  s.leader = bestIdx;
}

/** killUnit フック: 死亡ユニットの分隊メンバーカウントを減らし、リーダーなら継承処理 */
export function onUnitKilled(squadronIdx: SquadronIndex, victimIdx: UnitIndex, unitHWM: number): void {
  if (squadronIdx === NO_SQUADRON) {
    return;
  }

  const s = squadron(squadronIdx);
  s.memberCount--;

  if (s.leader === victimIdx) {
    s.leader = NO_UNIT;
    succeedLeader(squadronIdx, unitHWM);
  }

  if (s.memberCount <= 0) {
    s.alive = false;
    s.leader = NO_UNIT;
  }
}

/** 全分隊の目標タイマーを更新し、期限切れなら新目標を設定する */
export function updateSquadronObjectives(dt: number, rng: () => number): void {
  for (let si = 0; si < POOL_SQUADRONS; si++) {
    const s = squadron(si);
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
    s.objectiveX = centroid.x + (rng() - 0.5) * SQUADRON_OBJECTIVE_SCATTER;
    s.objectiveY = centroid.y + (rng() - 0.5) * SQUADRON_OBJECTIVE_SCATTER;
    s.objectiveTimer = SQUADRON_OBJECTIVE_MIN + rng() * (SQUADRON_OBJECTIVE_MAX - SQUADRON_OBJECTIVE_MIN);
  }
}

/** メンバーの分隊リーダー UnitIndex を返す。未所属・自身がリーダー・リーダー死亡時は NO_UNIT */
function memberLeaderIdx(u: Unit, ui: UnitIndex): UnitIndex {
  const si = u.squadronIdx;
  if (si === NO_SQUADRON) {
    return NO_UNIT;
  }
  const s = squadron(si);
  if (!s.alive || s.leader === NO_UNIT || s.leader === ui) {
    return NO_UNIT;
  }
  return unit(s.leader).alive ? s.leader : NO_UNIT;
}

/** メンバー → リーダーへの追従力（デッドゾーン付き二次）。結果は out に書き込まれる */
export function computeSquadronCohesion(u: Unit, ui: UnitIndex, out: { x: number; y: number }): void {
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
  if (dist <= SQUADRON_COHESION_DIST) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const excess = dist - SQUADRON_COHESION_DIST;
  const t = Math.min(excess / (SQUADRON_COHESION_RANGE - SQUADRON_COHESION_DIST), 1);
  const force = t * t * unitType(u.type).speed * SQUADRON_COHESION_WEIGHT;
  const inv = 1 / dist;
  out.x = dx * inv * force;
  out.y = dy * inv * force;
}

/** リーダーからの距離に応じた交戦力減衰ファクター（0〜1）。リーシュ距離超過で減衰し、最大距離で 0 */
export function computeSquadronLeashFactor(u: Unit, ui: UnitIndex): number {
  const li = memberLeaderIdx(u, ui);
  if (li === NO_UNIT) {
    return 1;
  }
  const leader = unit(li);

  const dx = leader.x - u.x;
  const dy = leader.y - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= SQUADRON_LEASH_DIST) {
    return 1;
  }
  if (dist >= SQUADRON_LEASH_MAX) {
    return 0;
  }
  return 1 - (dist - SQUADRON_LEASH_DIST) / (SQUADRON_LEASH_MAX - SQUADRON_LEASH_DIST);
}

/** リーダーかつ非戦闘時に分隊目標への seek 力を out に書き込む */
export function computeSquadronLeaderObjective(
  u: Unit,
  ui: UnitIndex,
  hasTarget: boolean,
  speed: number,
  out: { x: number; y: number },
): void {
  if (hasTarget || u.squadronIdx === NO_SQUADRON) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const s = squadron(u.squadronIdx);
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

const _squadronSnapshot: Squadron[] = [];

export function snapshotSquadrons(): void {
  for (let i = 0; i < POOL_SQUADRONS; i++) {
    const s = squadron(i);
    const existing = _squadronSnapshot[i];
    if (existing === undefined) {
      _squadronSnapshot[i] = { ...s };
    } else {
      Object.assign(existing, s);
    }
  }
}

export function restoreSquadrons(): void {
  for (let i = 0; i < POOL_SQUADRONS; i++) {
    const snap = _squadronSnapshot[i];
    if (snap !== undefined) {
      Object.assign(squadron(i), snap);
    }
  }
}

/** テザー描画対象のリーダーを返す。リーダー自身・未所属・リーダー死亡時は NO_UNIT */
export function getSquadronTetherTarget(u: Unit, i: UnitIndex): UnitIndex {
  return memberLeaderIdx(u, i);
}
