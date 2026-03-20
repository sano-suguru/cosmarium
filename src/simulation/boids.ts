import { unit } from '../pools-query.ts';
import type { Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import type { NeighborSlice } from './spatial-hash.ts';
import { targetScore } from './target-search.ts';

export interface SteerForce {
  x: number;
  y: number;
}

interface BoidsSearchResult {
  target: UnitIndex;
  fx: number;
  fy: number;
}

const _boidsForce: SteerForce = { x: 0, y: 0 };
const _boidsSearchResult: BoidsSearchResult = { target: NO_UNIT as UnitIndex, fx: 0, fy: 0 };

const SEPARATION_SCALE = 400;
const COHESION_RANGE = 150;
const ALIGNMENT_RANGE = 120;

// Boids accumulator — computeBoidsForce がリセットし accumulateBoidsNeighbor が累積
const _boids = { sx: 0, sy: 0, ax: 0, ay: 0, ac: 0, chx: 0, chy: 0, cc: 0 };

function accumulateBoidsNeighbor(u: Unit, o: Unit, sd: number, uMass: number) {
  const dx = u.x - o.x,
    dy = u.y - o.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) {
    return;
  }
  const d = Math.sqrt(d2);

  if (d < sd) {
    const massScale = Math.sqrt(unitType(o.type).mass / uMass);
    _boids.sx += (dx / d / d2) * SEPARATION_SCALE * massScale;
    _boids.sy += (dy / d / d2) * SEPARATION_SCALE * massScale;
  }
  if (o.team === u.team) {
    if (d < COHESION_RANGE) {
      _boids.chx += o.x;
      _boids.chy += o.y;
      _boids.cc++;
    }
    if (o.type === u.type && d < ALIGNMENT_RANGE) {
      _boids.ax += o.vx;
      _boids.ay += o.vy;
      _boids.ac++;
    }
  }
}

function finalizeBoids(u: Unit, t: UnitType) {
  let fx = _boids.sx * t.separationWeight,
    fy = _boids.sy * t.separationWeight;
  if (_boids.ac > 0) {
    fx += (_boids.ax / _boids.ac - u.vx) * t.alignmentWeight;
    fy += (_boids.ay / _boids.ac - u.vy) * t.alignmentWeight;
  }
  if (_boids.cc > 0) {
    fx += (_boids.chx / _boids.cc - u.x) * t.cohesionWeight;
    fy += (_boids.chy / _boids.cc - u.y) * t.cohesionWeight;
  }
  _boidsForce.x = fx;
  _boidsForce.y = fy;
}

export function computeBoidsForce(u: Unit, nb: NeighborSlice, t: UnitType): SteerForce {
  _boids.sx = 0;
  _boids.sy = 0;
  _boids.ax = 0;
  _boids.ay = 0;
  _boids.ac = 0;
  _boids.chx = 0;
  _boids.chy = 0;
  _boids.cc = 0;

  const sd = t.size * 6;
  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i),
      o = unit(oi);
    if (!o.alive || o === u) {
      continue;
    }
    accumulateBoidsNeighbor(u, o, sd, t.mass);
  }

  finalizeBoids(u, t);
  return _boidsForce;
}

/** boids 計算と最近接敵探索を1パスで行う。boids 力とターゲットの UnitIndex を返す */
export function computeBoidsAndFindLocal(
  u: Unit,
  nb: NeighborSlice,
  t: UnitType,
  aggroRange: number,
  massWeight: number,
): BoidsSearchResult {
  _boids.sx = 0;
  _boids.sy = 0;
  _boids.ax = 0;
  _boids.ay = 0;
  _boids.ac = 0;
  _boids.chx = 0;
  _boids.chy = 0;
  _boids.cc = 0;

  const sd = t.size * 6;
  const aggroR2 = aggroRange * aggroRange;
  let bs = aggroR2;
  let bi: UnitIndex = NO_UNIT;

  for (let i = 0; i < nb.count; i++) {
    const oi = nb.at(i),
      o = unit(oi);
    if (!o.alive || o === u) {
      continue;
    }

    accumulateBoidsNeighbor(u, o, sd, t.mass);

    if (o.team !== u.team) {
      const score = targetScore(u.x, u.y, o, massWeight, aggroR2);
      if (score < bs) {
        bs = score;
        bi = oi;
      }
    }
  }

  finalizeBoids(u, t);
  _boidsSearchResult.target = bi;
  _boidsSearchResult.fx = _boidsForce.x;
  _boidsSearchResult.fy = _boidsForce.y;
  return _boidsSearchResult;
}
