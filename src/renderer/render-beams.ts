import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { SH_BEAM, SH_LIGHTNING, WORLD_SIZE } from '../constants.ts';
import { lerpX, lerpY } from '../interpolation.ts';
import { unit } from '../pools-query.ts';
import type { Beam, TrackingBeam, Unit } from '../types.ts';
import { BEAM_ALPHA, BEAM_MAX_WIDTH_SCALE, beamFlicker, beamSegmentCount, beamWidthScale } from './beam-segment.ts';
import { isSegmentVisible, writeInstance } from './render-write.ts';
import { renderSquadronTethers } from './squadron-tether.ts';

/** ライトニングビームの垂直逸脱倍率 */
const LIGHTNING_DEVIATION_FACTOR = 4;

// 最大距離 = WORLD_SIZE*2*sqrt(2), ステップ幅8px
const MAX_LIGHTNING_STEPS = ((WORLD_SIZE * 2 * Math.SQRT2) / 8) | 0;
const _lightningPts = new Float64Array((MAX_LIGHTNING_STEPS + 1) * 2);

function writeBeam(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number = SH_BEAM,
) {
  writeInstance(x, y, size, r, g, b, a, angle, shape);
}

function computeTaperScale(tail: number): number {
  if (tail === 0) {
    return 0.25;
  }
  if (tail === 1) {
    return 0.5;
  }
  if (tail === 2) {
    return 0.8;
  }
  return 1;
}

function renderLightningBeam(bm: Beam, now: number, al: number, dx: number, dy: number, d: number, ang: number) {
  const lSteps = Math.min(MAX_LIGHTNING_STEPS, Math.max(3, (d / 8) | 0));
  const perpX = -Math.sin(ang),
    perpY = Math.cos(ang);
  let ptsLen = 0;
  for (let j = 0; j <= lSteps; j++) {
    const t = j / lSteps;
    let off = 0;
    if (j > 0 && j < lSteps) {
      const h = Math.sin(j * 127.1 + now * 40) * 43758.5;
      const rnd = h - Math.floor(h);
      off = (rnd * 2 - 1) * bm.width * LIGHTNING_DEVIATION_FACTOR;
    }
    _lightningPts[ptsLen++] = bm.x1 + dx * t + perpX * off;
    _lightningPts[ptsLen++] = bm.y1 + dy * t + perpY * off;
  }
  for (let j = 0; j < lSteps; j++) {
    const x0 = _lightningPts[j * 2] as number,
      y0 = _lightningPts[j * 2 + 1] as number;
    const x1 = _lightningPts[j * 2 + 2] as number,
      y1 = _lightningPts[j * 2 + 3] as number;
    const mx = (x0 + x1) * 0.5,
      my = (y0 + y1) * 0.5;
    const segDx = x1 - x0,
      segDy = y1 - y0;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    const segAng = Math.atan2(segDy, segDx);
    const fl = 0.8 + Math.sin(j * 5.0 + now * 55) * 0.2;
    const white = 0.5 + al * 0.5;
    writeBeam(
      mx,
      my,
      segLen * 0.6,
      (bm.r * 0.4 + white * 0.6) * al * fl,
      (bm.g * 0.4 + white * 0.6) * al * fl,
      (bm.b * 0.4 + white * 0.6) * al * fl,
      al * 0.9,
      segAng,
      SH_LIGHTNING,
    );
  }
}

function renderTrackingBeamSegments(x1: number, y1: number, x2: number, y2: number, tb: TrackingBeam, now: number) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy);
  const steps = beamSegmentCount(d);
  const ang = Math.atan2(dy, dx);
  const al = tb.life / tb.maxLife;
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const fl = beamFlicker(j, now);
    writeBeam(
      x1 + dx * t,
      y1 + dy * t,
      tb.width * beamWidthScale(j, now),
      tb.r * al * fl,
      tb.g * al * fl,
      tb.b * al * fl,
      al * BEAM_ALPHA,
      ang,
    );
  }
}

let _bx = 0;
let _by = 0;
function resolveEndpoint(u: Unit, fbX: number, fbY: number): void {
  if (u.alive) {
    _bx = lerpX(u);
    _by = lerpY(u);
  } else {
    _bx = fbX;
    _by = fbY;
  }
}

function renderTrackingBeams(now: number) {
  for (let i = 0; i < trackingBeams.length; i++) {
    const tb = getTrackingBeam(i);
    resolveEndpoint(unit(tb.srcUnit), tb.x1, tb.y1);
    const x1 = _bx,
      y1 = _by;
    resolveEndpoint(unit(tb.tgtUnit), tb.x2, tb.y2);
    const x2 = _bx,
      y2 = _by;
    if (!isSegmentVisible(x1, y1, x2, y2, tb.width * BEAM_MAX_WIDTH_SCALE)) {
      continue;
    }
    renderTrackingBeamSegments(x1, y1, x2, y2, tb, now);
  }
}

function renderNormalBeamSegments(bm: Beam, now: number, al: number, dx: number, dy: number, d: number, ang: number) {
  const steps = beamSegmentCount(d, bm.stepDiv);
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const fl = beamFlicker(j, now);
    const tipScale = bm.tapered ? computeTaperScale(steps - j) : 1;
    writeBeam(
      bm.x1 + dx * t,
      bm.y1 + dy * t,
      bm.width * beamWidthScale(j, now) * tipScale,
      bm.r * al * fl,
      bm.g * al * fl,
      bm.b * al * fl,
      al * BEAM_ALPHA,
      ang,
    );
  }
}

export function renderBeams(now: number) {
  for (let i = 0; i < beams.length; i++) {
    const bm = getBeam(i);
    const beamHW = bm.lightning ? bm.width * LIGHTNING_DEVIATION_FACTOR : bm.width * BEAM_MAX_WIDTH_SCALE;
    if (!isSegmentVisible(bm.x1, bm.y1, bm.x2, bm.y2, beamHW)) {
      continue;
    }
    const al = bm.life / bm.maxLife;
    const dx = bm.x2 - bm.x1,
      dy = bm.y2 - bm.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    if (bm.lightning) {
      renderLightningBeam(bm, now, al, dx, dy, d, ang);
    } else {
      renderNormalBeamSegments(bm, now, al, dx, dy, d, ang);
    }
  }
  renderTrackingBeams(now);
  renderSquadronTethers(now, writeBeam, isSegmentVisible);
}
