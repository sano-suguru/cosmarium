import { acquireBeam, acquireTrackingBeam, beams, trackingBeams } from '../beams.ts';
import { POOL_TRACKING_BEAMS } from '../constants.ts';
import { unit } from '../pools-query.ts';
import type { UnitIndex } from '../types.ts';

export function addBeam(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  life: number,
  width: number,
  tapered = false,
  stepDiv = 1,
  lightning = false,
) {
  const bm = acquireBeam();
  bm.x1 = x1;
  bm.y1 = y1;
  bm.x2 = x2;
  bm.y2 = y2;
  bm.r = r;
  bm.g = g;
  bm.b = b;
  bm.life = life;
  bm.maxLife = life;
  bm.width = width;
  bm.tapered = tapered;
  bm.stepDiv = stepDiv;
  bm.lightning = lightning;
  beams.push(bm);
}

export function addTrackingBeam(
  srcUnit: UnitIndex,
  tgtUnit: UnitIndex,
  r: number,
  g: number,
  b: number,
  life: number,
  width: number,
) {
  if (trackingBeams.length >= POOL_TRACKING_BEAMS) {
    return;
  }
  const src = unit(srcUnit);
  const tgt = unit(tgtUnit);
  const tb = acquireTrackingBeam();
  tb.srcUnit = srcUnit;
  tb.tgtUnit = tgtUnit;
  tb.x1 = src.x;
  tb.y1 = src.y;
  tb.x2 = tgt.x;
  tb.y2 = tgt.y;
  tb.r = r;
  tb.g = g;
  tb.b = b;
  tb.life = life;
  tb.maxLife = life;
  tb.width = width;
  trackingBeams.push(tb);
}
