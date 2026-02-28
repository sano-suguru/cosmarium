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

/** ビーム消灯時の減衰速度（sweep / focus / flagship 共通） */
export const BEAM_DECAY_RATE = 3;
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const REF_FPS = 30;

// ── Shape IDs ──
// Units 0–18, Effects 19–28 (stable IDs, append-only — 既存IDの変更・再利用禁止)
// Primitives
export const SH_CIRCLE = 19;
export const SH_DIAMOND = 20;
export const SH_HOMING = 21;
// Beams
export const SH_BEAM = 22;
export const SH_LIGHTNING = 23;
// Rings / Auras
export const SH_EXPLOSION_RING = 24;
export const SH_DIAMOND_RING = 25;
export const SH_OCT_SHIELD = 26;
export const SH_REFLECT_FIELD = 27;
// UI
export const SH_BAR = 28;

export const REFLECT_FIELD_MAX_HP = 15;
export const AMP_BOOST_LINGER = 2;
export const SCRAMBLE_BOOST_LINGER = 1.5;
export const CATALYST_BOOST_LINGER = 2.0;
