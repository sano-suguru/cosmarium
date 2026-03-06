// Screen-wide visual effects state (chromatic aberration, freeze)
// Pattern: src root data store (like beams.ts / state.ts). Written by simulation, read by renderer.

const ABERRATION_DECAY_RATE = 8;
const FLASH_DECAY_RATE = 12;
const MAX_ABERRATION = 1;
const MAX_FLASH = 1;
const MAX_FREEZE = 0.08;

export const screenEffects = {
  /** Current chromatic aberration intensity (0–1). Decays exponentially. */
  aberrationIntensity: 0,
  /** Remaining freeze duration in seconds. Linear decay. */
  freezeTimer: 0,
  /** Current screen flash intensity (0–1). Decays exponentially. */
  flashIntensity: 0,
};

export function addAberration(intensity: number): void {
  if (intensity > screenEffects.aberrationIntensity) {
    screenEffects.aberrationIntensity = Math.min(intensity, MAX_ABERRATION);
  }
}

export function addFlash(intensity: number): void {
  if (intensity > screenEffects.flashIntensity) {
    screenEffects.flashIntensity = Math.min(intensity, MAX_FLASH);
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

  screenEffects.flashIntensity *= Math.exp(-FLASH_DECAY_RATE * dt);
  if (screenEffects.flashIntensity < 0.01) {
    screenEffects.flashIntensity = 0;
  }

  if (screenEffects.freezeTimer > 0) {
    screenEffects.freezeTimer = Math.max(0, screenEffects.freezeTimer - dt);
  }
}

export function resetScreenEffects(): void {
  screenEffects.aberrationIntensity = 0;
  screenEffects.freezeTimer = 0;
  screenEffects.flashIntensity = 0;
}
