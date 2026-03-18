import { beams, clearBeamPools, trackingBeams } from './beams.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_SQUADRONS, POOL_UNITS } from './constants.ts';
import { unitPool } from './pools-init.ts';
import { initParticleFreeStack, rebuildParticleFreeStack } from './pools-particle.ts';
import { particle, projectile, squadron, unit } from './pools-query.ts';
import type { Team, TeamCounts, TeamTuple } from './team.ts';
import { TEAMS, teamAt } from './team.ts';
import type { UnitIndex, UnitTypeIndex } from './types.ts';
import { NO_TYPE, NO_UNIT } from './types.ts';

let _unitHWM = 0;
let _particleHWM = 0;
let _projectileHWM = 0;

export function advanceUnitHWM(i: number) {
  if (i >= _unitHWM) {
    _unitHWM = i + 1;
  }
}
export function advanceParticleHWM(i: number) {
  if (i >= _particleHWM) {
    _particleHWM = i + 1;
  }
}
export function advanceProjectileHWM(i: number) {
  if (i >= _projectileHWM) {
    _projectileHWM = i + 1;
  }
}

export function getUnitHWM() {
  return _unitHWM;
}
export function getParticleHWM() {
  return _particleHWM;
}
export function getProjectileHWM() {
  return _projectileHWM;
}
export function resetHWM() {
  _unitHWM = 0;
  _particleHWM = 0;
  _projectileHWM = 0;
}

const _counts = { units: 0, particles: 0, projectiles: 0 };
const _teamUnits: TeamCounts = [0, 0, 0, 0, 0];
const _mothershipIdx: TeamTuple<UnitIndex> = [NO_UNIT, NO_UNIT, NO_UNIT, NO_UNIT, NO_UNIT];
const _mothershipType: TeamTuple<UnitTypeIndex> = [NO_TYPE, NO_TYPE, NO_TYPE, NO_TYPE, NO_TYPE];

export const poolCounts: Readonly<{ units: number; particles: number; projectiles: number }> = _counts;
export const teamUnitCounts: Readonly<TeamCounts> = _teamUnits;
export const mothershipIdx: Readonly<TeamTuple<UnitIndex>> = _mothershipIdx;
export const mothershipType: Readonly<TeamTuple<UnitTypeIndex>> = _mothershipType;

function setMothershipType(team: Team, typeIdx: UnitTypeIndex) {
  _mothershipType[team] = typeIdx;
}

/** 母艦のユニットインデックスとタイプを不可分に登録する。チームにつき1体まで（二重登録で RangeError） */
export function registerMothership(team: Team, unitIndex: UnitIndex, msType: UnitTypeIndex) {
  incMotherships(team, unitIndex);
  setMothershipType(team, msType);
}

/** 母艦のユニットインデックスを登録する。チームにつき1体まで（二重登録で RangeError） */
function incMotherships(team: Team, unitIndex: UnitIndex) {
  if (unitIndex < 0 || unitIndex >= POOL_UNITS) {
    throw new RangeError(`unitIndex out of range: ${unitIndex}`);
  }
  if (_mothershipIdx[team] !== NO_UNIT) {
    throw new RangeError(`mothershipIdx[${team}] already set`);
  }
  _mothershipIdx[team] = unitIndex;
}
/** 母艦インデックスを NO_UNIT にリセット。killUnit の alive ガード内でのみ呼ぶこと */
export function decMotherships(team: Team) {
  if (_mothershipIdx[team] === NO_UNIT) {
    throw new RangeError(`mothershipIdx[${team}] already NO_UNIT`);
  }
  _mothershipIdx[team] = NO_UNIT;
  _mothershipType[team] = NO_TYPE;
}
export function incUnits(team: Team) {
  if (_counts.units >= POOL_UNITS) {
    throw new RangeError(`unitCount at pool limit (${POOL_UNITS})`);
  }
  _counts.units++;
  _teamUnits[team]++;
}
export function decUnits(team: Team) {
  if (_counts.units <= 0) {
    throw new RangeError('unitCount already 0');
  }
  if (_teamUnits[team] <= 0) {
    throw new RangeError(`teamUnitCount[${team}] already 0`);
  }
  _counts.units--;
  _teamUnits[team]--;
}
export function incParticles() {
  if (_counts.particles >= POOL_PARTICLES) {
    throw new RangeError(`particleCount at pool limit (${POOL_PARTICLES})`);
  }
  _counts.particles++;
}
export function decParticles() {
  if (_counts.particles <= 0) {
    throw new RangeError('particleCount already 0');
  }
  _counts.particles--;
}
export function incProjectiles() {
  if (_counts.projectiles >= POOL_PROJECTILES) {
    throw new RangeError(`projectileCount at pool limit (${POOL_PROJECTILES})`);
  }
  _counts.projectiles++;
}
export function decProjectiles() {
  if (_counts.projectiles <= 0) {
    throw new RangeError('projectileCount already 0');
  }
  _counts.projectiles--;
}
export function resetPoolCounts() {
  _counts.units = 0;
  _counts.particles = 0;
  _counts.projectiles = 0;
  _teamUnits.fill(0);
  for (const t of TEAMS) {
    _mothershipIdx[t] = NO_UNIT;
    _mothershipType[t] = NO_TYPE;
  }
  initParticleFreeStack();
}
/** テスト専用: ユニット総数を直接設定する。teamUnitCounts は全0にリセットされる */
export function setUnitCount(n: number) {
  _counts.units = n;
  _teamUnits.fill(0);
}
/** テスト専用: パーティクル総数を直接設定する。freeStack も再構築される */
export function setParticleCount(n: number) {
  _counts.particles = n;
  rebuildParticleFreeStack();
}
/** テスト専用: プロジェクタイル総数を直接設定する */
export function setProjectileCount(n: number) {
  _counts.projectiles = n;
}
export function clearAllPools() {
  for (let i = 0; i < _unitHWM; i++) {
    unit(i).alive = false;
  }
  for (let i = 0; i < _particleHWM; i++) {
    particle(i).alive = false;
  }
  for (let i = 0; i < _projectileHWM; i++) {
    projectile(i).alive = false;
  }
  for (let i = 0; i < POOL_SQUADRONS; i++) {
    const s = squadron(i);
    s.alive = false;
    s.memberCount = 0;
  }
  resetPoolCounts();
  resetHWM();
  beams.length = 0;
  trackingBeams.length = 0;
  clearBeamPools();
}

/** teamCount チーム中、母艦が生存している数を返す */
export function countAliveMotherships(teamCount: number): number {
  let count = 0;
  for (let t = 0; t < teamCount; t++) {
    const team = teamAt(t);
    const idx = _mothershipIdx[team];
    if (idx !== NO_UNIT && unitPool[idx]?.alive) {
      count++;
    }
  }
  return count;
}
