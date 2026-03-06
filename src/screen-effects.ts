// Screen-wide visual effects state (chromatic aberration, freeze)
// Pattern: src root data store (like beams.ts / state.ts). Written by simulation, read by renderer.

const ABERRATION_DECAY_RATE = 8;
const MAX_FREEZE = 0.08;

export const screenEffects = {
  /** Current chromatic aberration intensity (0–1). Decays exponentially. */
  aberrationIntensity: 0,
  /** Remaining freeze duration in seconds. Linear decay. */
  freezeTimer: 0,
};

export function addAberration(intensity: number): void {
  if (intensity > screenEffects.aberrationIntensity) {
    screenEffects.aberrationIntensity = intensity;
  }
}

export function addFreeze(duration: number): void {
  const merged = Math.max(screenEffects.freezeTimer, duration);
  screenEffects.freezeTimer = Math.min(merged, MAX_FREEZE);
}

export function decayScreenEffects(dt: number): void {
  screenEffects.aberrationIntensity *= Math.exp(-ABERRATION_DECAY_RATE * dt);
  if (screenEffects.aberrationIntensity < 0.01) {
    screenEffects.aberrationIntensity = 0;
  }

  if (screenEffects.freezeTimer > 0) {
    screenEffects.freezeTimer = Math.max(0, screenEffects.freezeTimer - dt);
  }
}

export function resetScreenEffects(): void {
  screenEffects.aberrationIntensity = 0;
  screenEffects.freezeTimer = 0;
}
