// ここには「複数レイヤーから参照される定数」のみを置く。
//   例: simulation + renderer の両方が使うプールサイズ、ワールド境界、linger時間、シェイプID
// 単一モジュール（+ そのテスト）でしか使わないロジック固有の倍率・閾値は、そのモジュール内に定義する。
//   例: AMP_DAMAGE_MULT → combat.ts, SCRAMBLE_RADIUS → update.ts

import { MAX_TEAMS } from './team.ts';
import type { TimeScale } from './types.ts';
export const POOL_UNITS = 1600;
export const POOL_PARTICLES = 45000;
export const POOL_PROJECTILES = 6000;
export const POOL_TRACKING_BEAMS = 200;
export const WORLD_SIZE = 4000;

export const SQUADRONS_PER_TEAM = 4;
export const POOL_SQUADRONS = SQUADRONS_PER_TEAM * MAX_TEAMS;

/** ビーム消灯時の減衰速度（sweep / focus / flagship 共通） */
export const BEAM_DECAY_RATE = 3;
export const PI = Math.PI;
export const TAU = Math.PI * 2;
/**
 * 固定シミュレーション周波数。ステアリング精度の観点で 60 を選択。
 * パフォーマンスがボトルネックになった場合は 30 + 補間への切替を検討。
 */
export const REF_FPS = 60;

/** 固定シミュレーションステップ (1/REF_FPS ≈ 0.0167秒) */
export const SIM_DT = 1 / REF_FPS;

// ユニットシェイプ = TYPES配列インデックス (0–23)
// エフェクト = EFFECT_SHAPE_BASE (32) から連番。24–31 は将来のユニット用に予約
// 予約枠により、ユニット追加時にエフェクトIDの再番号付けが不要になる
// shape-sync.test.ts が検証。IDの再利用禁止
export const EFFECT_SHAPE_BASE = 32;
export const SH_CIRCLE = EFFECT_SHAPE_BASE + 0;
export const SH_DIAMOND = EFFECT_SHAPE_BASE + 1;
export const SH_HOMING = EFFECT_SHAPE_BASE + 2;
export const SH_BEAM = EFFECT_SHAPE_BASE + 3;
export const SH_LIGHTNING = EFFECT_SHAPE_BASE + 4;
export const SH_EXPLOSION_RING = EFFECT_SHAPE_BASE + 5;
export const SH_DIAMOND_RING = EFFECT_SHAPE_BASE + 6;
export const SH_OCT_SHIELD = EFFECT_SHAPE_BASE + 7;
export const SH_REFLECT_FIELD = EFFECT_SHAPE_BASE + 8;
export const SH_BAR = EFFECT_SHAPE_BASE + 9;
export const SH_TRAIL = EFFECT_SHAPE_BASE + 10;

export const REFLECT_FIELD_MAX_HP = 15;
export const AMP_BOOST_LINGER = 2;
export const SCRAMBLE_BOOST_LINGER = 1.5;
export const CATALYST_BOOST_LINGER = 2.0;
export const NEIGHBOR_RANGE = 200;

export const SPEEDS = [1, 2, 4] as const satisfies readonly TimeScale[];
