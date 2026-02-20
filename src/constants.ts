export const POOL_UNITS = 800;
export const POOL_PARTICLES = 45000;
export const POOL_PROJECTILES = 6000;
export const POOL_TRACKING_BEAMS = 200;
export const WORLD_SIZE = 4000;
export const CELL_SIZE = 100;
export const MAX_INSTANCES = 100000;
export const MINIMAP_MAX = 1200;
export const STRIDE_BYTES = 36;
export const NEIGHBOR_BUFFER_SIZE = 350;
export const REFLECTOR_SHIELD_LINGER = 2;
export const REFLECTOR_TETHER_BEAM_LIFE = 0.7;
export const SWARM_RADIUS_SQ = 80 * 80;
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const BASE_SPEED = 0.55;
export const REF_FPS = 30;
export const MAX_STEPS_PER_FRAME = 8;

// Non-unit shape IDs (particles, projectiles, overlays)
// These occupy unused slots in the 0-26 shape range to avoid collision with unit shapes
export const SH_CIRCLE = 3;
export const SH_DIAMOND = 4;
export const SH_EXPLOSION_RING = 10;
export const SH_BEAM = 12;
export const SH_HOMING = 14;
export const SH_STAR = 17;
export const SH_BAR = 21;
export const SH_OCT_SHIELD = 22;
export const SH_LIGHTNING = 23;
