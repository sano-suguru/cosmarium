import type { Beam, GameState, TrackingBeam } from './types.ts';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type State = {
  gameState: GameState;
  codexOpen: boolean;
  codexSelected: number;
  timeScale: number;
  reinforcementTimer: number;
  rng: () => number;
};

let currentSeed = Date.now();
let currentRng = mulberry32(currentSeed);

export function rng(): number {
  return state.rng();
}

export function seedRng(seed: number): void {
  currentSeed = seed;
  currentRng = mulberry32(seed);
  state.rng = currentRng;
}

export function getSeed(): number {
  return currentSeed;
}

export const state: State = {
  gameState: 'menu',
  codexOpen: false,
  codexSelected: 0,
  timeScale: 1,
  reinforcementTimer: 0,
  rng: currentRng,
};

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
