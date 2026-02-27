// ── 配置基準 ──
// ここには「複数レイヤーから参照される定数」のみを置く。
//   例: simulation + renderer の両方が使うプールサイズ、ワールド境界、linger時間、シェイプID
// 単一モジュール（+ そのテスト）でしか使わないロジック固有の倍率・閾値は、そのモジュール内に定義する。
//   例: AMP_DAMAGE_MULT → combat.ts, SCRAMBLE_RADIUS → update.ts

export const POOL_UNITS = 1600;
export const POOL_PARTICLES = 45000;
export const POOL_PROJECTILES = 6000;
export const POOL_TRACKING_BEAMS = 200;
export const WORLD_SIZE = 4000;
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const REF_FPS = 30;

// These occupy unused slots in the 0-27 shape range to avoid collision with unit shapes
export const SH_CIRCLE = 3;
export const SH_DIAMOND = 4;
export const SH_EXPLOSION_RING = 10;

export const REFLECT_FIELD_MAX_HP = 15;
export const AMP_BOOST_LINGER = 2;
export const SCRAMBLE_BOOST_LINGER = 1.5;
export const SH_DIAMOND_RING = 17;
