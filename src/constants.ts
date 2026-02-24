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
export const SHIELD_LINGER = 2;
export const TETHER_BEAM_LIFE = 0.7;
export const SWARM_RADIUS_SQ = 80 * 80;
export const HIT_FLASH_DURATION = 0.08;
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const BASE_SPEED = 0.55;
export const REF_FPS = 30;
export const MAX_STEPS_PER_FRAME = 8;

// Non-unit shape IDs (particles, projectiles, overlays)
// These occupy unused slots in the 0-27 shape range to avoid collision with unit shapes
export const SH_CIRCLE = 3;
export const SH_DIAMOND = 4;
export const SH_EXPLOSION_RING = 10;
export const SH_BEAM = 12;
export const SH_HOMING = 14;
export const SH_DIAMOND_RING = 17;
export const SH_BAR = 21;
export const SH_OCT_SHIELD = 22;
export const SH_LIGHTNING = 23;
export const SH_REFLECT_FIELD = 27;
export const BLINK_KILL_CD = 0.8;

export const REFLECT_FIELD_MAX_HP = 15;
export const REFLECT_FIELD_COOLDOWN = 3;
export const REFLECT_FIELD_RADIUS = 100;
export const REFLECT_BEAM_DAMAGE_MULT = 0.5;

export const BASTION_SHIELD_RADIUS = 120;
export const BASTION_ABSORB_RATIO = 0.4;
export const BASTION_MAX_TETHERS = 4;
export const BASTION_SELF_ABSORB_RATIO = 0.3;

// 孤児テザー（Bastion死亡/shields不一致時）のダメージ通過率
// 値が大きいほど軽減が弱い。Bastion生存時(60%通過)より必ず弱い軽減にすること
// ビームは持続ダメージのため弾より軽減が弱い（0.8 > 0.7）
export const ORPHAN_TETHER_PROJECTILE_MULT = 0.7;
export const ORPHAN_TETHER_BEAM_MULT = 0.8;

// TAU multiple keeps sin(now*N) continuous at wrap boundary; ×10000 ≈ 17.5h before reset
export const WRAP_PERIOD = TAU * 10000;
