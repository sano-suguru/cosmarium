import type { Beam, TrackingBeam } from './types.ts';

export const beams: Beam[] = [];

export function getBeam(i: number): Beam {
  const b = beams[i];
  if (b === undefined) throw new RangeError(`Invalid beam index: ${i}`);
  return b;
}

export const trackingBeams: TrackingBeam[] = [];

export function getTrackingBeam(i: number): TrackingBeam {
  const b = trackingBeams[i];
  if (b === undefined) throw new RangeError(`Invalid tracking beam index: ${i}`);
  return b;
}
