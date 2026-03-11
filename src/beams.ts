import { unitIdx } from './pool-index.ts';
import type { Beam, TrackingBeam } from './types.ts';

export const beams: Beam[] = [];

export function getBeam(i: number): Beam {
  const b = beams[i];
  if (b === undefined) {
    throw new RangeError(`Invalid beam index: ${i}`);
  }
  return b;
}

export const trackingBeams: TrackingBeam[] = [];

export function getTrackingBeam(i: number): TrackingBeam {
  const b = trackingBeams[i];
  if (b === undefined) {
    throw new RangeError(`Invalid tracking beam index: ${i}`);
  }
  return b;
}

// GC回避: ビームオブジェクトフリーリスト
const _beamPool: Beam[] = [];
const _trackingBeamPool: TrackingBeam[] = [];

export function acquireBeam(): Beam {
  return (
    _beamPool.pop() ?? {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      r: 0,
      g: 0,
      b: 0,
      life: 0,
      maxLife: 0,
      width: 0,
      tapered: false,
      stepDiv: 1,
      lightning: false,
    }
  );
}

export function releaseBeam(b: Beam): void {
  _beamPool.push(b);
}

export function acquireTrackingBeam(): TrackingBeam {
  return (
    _trackingBeamPool.pop() ?? {
      srcUnit: unitIdx(0),
      tgtUnit: unitIdx(0),
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      r: 0,
      g: 0,
      b: 0,
      life: 0,
      maxLife: 0,
      width: 0,
    }
  );
}

export function releaseTrackingBeam(tb: TrackingBeam): void {
  _trackingBeamPool.push(tb);
}

export function clearBeamPools(): void {
  _beamPool.length = 0;
  _trackingBeamPool.length = 0;
}
