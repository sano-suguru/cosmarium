import {
  AMP_BOOST_LINGER,
  CATALYST_BOOST_LINGER,
  REFLECT_FIELD_MAX_HP,
  SCRAMBLE_BOOST_LINGER,
  SH_BAR,
  SH_CIRCLE,
  SH_DIAMOND_RING,
  SH_EXPLOSION_RING,
  SH_OCT_SHIELD,
  SH_REFLECT_FIELD,
  TAU,
} from '../constants.ts';
import type { Color3, Unit, UnitType } from '../types.ts';
import { isCircleVisible, isSegmentVisible, writeInstance, writeOverlay } from './render-write.ts';

/** vet リングの基本サイズ倍率 */
const VET_OVERLAY_BASE = 1.4;
/** vet レベルあたりの追加サイズ倍率 */
const VET_OVERLAY_PER_LEVEL = 0.3;
/** vet リングのパルス振幅 */
const VET_PULSE_AMP = 0.1;

/** scramble outer overlay の固定最小サイズ (renderBuffOverlays 内の Math.max(30, ...) と対応) */
export const SCRAMBLE_OVERLAY_MIN = 30;
/** scramble inner overlay の固定最小サイズ */
const SCRAMBLE_INNER_MIN = 22;

/**
 * 全オーバーレイの最大サイズ倍率（カリング半径の基準）。
 * 各オーバーレイはこの値以下でなければならない:
 *   scramble outer = OVERLAY_FACTOR (定義)
 *   swarm          = OVERLAY_FACTOR
 *   vet max        = (VET_OVERLAY_BASE + 2 * VET_OVERLAY_PER_LEVEL) * (1 + VET_PULSE_AMP) = 2.2
 *   catalyst max   = BUFF_OVERLAY_FACTOR * (1 + CATALYST_PULSE_AMP) = 1.904
 *   shield linger  = SHIELD_LINGER_FACTOR = 1.8
 *   reflect field  = REFLECT_FIELD_FACTOR = 1.6
 *   shield active  = SHIELD_ACTIVE_FACTOR = 1.5
 */
export const OVERLAY_FACTOR = 2.2;
/** scramble inner overlay のサイズ倍率 */
const SCRAMBLE_INNER_FACTOR = 1.5;
/** amp/catalyst バフオーバーレイのサイズ倍率 */
const BUFF_OVERLAY_FACTOR = 1.7;
/** catalyst パルスの振幅 (BUFF_OVERLAY_FACTOR × (1+AMP) = 1.904 ≤ OVERLAY_FACTOR) */
const CATALYST_PULSE_AMP = 0.12;

/** アクティブシールドのサイズ倍率 */
const SHIELD_ACTIVE_FACTOR = 1.5;
/** シールドリンガーのサイズ倍率 */
const SHIELD_LINGER_FACTOR = 1.8;
/** リフレクトフィールドのサイズ倍率 */
const REFLECT_FIELD_FACTOR = 1.6;

/** HP バーの幅倍率 */
const HP_BAR_WIDTH_FACTOR = 1.5;
/** HP バーの Y オフセット倍率 */
const HP_BAR_Y_OFFSET_FACTOR = 1.3;
/** スタンスターの軌道半径倍率 */
const STUN_STAR_ORBIT_FACTOR = 0.7;
/** スタンスターの固定サイズ (world units) */
const STUN_STAR_SIZE = 2;

const GHOST_COUNT = 5;
const GHOST_GREEN_TINT = 0.3;
const GHOST_BASE_ALPHA = 0.3;
const GHOST_SIZE_DECAY = 0.08;
const GHOST_TRAIL_SPD_FACTOR = 0.12;
const GHOST_TRAIL_MIN_FACTOR = 2.0;

const SPEED_EPSILON = 0.001;

export function renderStunStars(rx: number, ry: number, u: Unit, ut: UnitType, now: number, rs: number) {
  if (u.stun > 0) {
    for (let j = 0; j < 2; j++) {
      const sa = now * 5 + j * 3.14;
      writeInstance(
        rx + Math.cos(sa) * ut.size * STUN_STAR_ORBIT_FACTOR * rs,
        ry + Math.sin(sa) * ut.size * STUN_STAR_ORBIT_FACTOR * rs,
        STUN_STAR_SIZE * rs,
        0.5,
        0.5,
        1,
        0.5,
        0,
        SH_CIRCLE,
      );
    }
  }
}

export function renderHpBar(rx: number, ry: number, u: Unit, ut: UnitType, rs: number) {
  const hr = u.hp / u.maxHp;
  if (hr < 1) {
    const bw = ut.size * HP_BAR_WIDTH_FACTOR * rs;
    const barY = ry - ut.size * HP_BAR_Y_OFFSET_FACTOR * rs;
    writeInstance(rx, barY, bw * 0.5, 0.04, 0.05, 0.08, 0.35, 0, SH_BAR);
    const hpW = bw * hr;
    const hpB = Math.max(0, (hr - 0.5) * 1.4);
    writeInstance(rx - (bw - hpW) * 0.5, barY, hpW * 0.5, 1 - hr, hr, hpB, 0.75, 0, SH_BAR);
  }
}

function renderBuffOverlays(rx: number, ry: number, u: Unit, ut: UnitType, now: number, rs: number) {
  if (u.ampBoostTimer > 0 && !ut.amplifies) {
    const ampAlpha = 0.08 + (u.ampBoostTimer / AMP_BOOST_LINGER) * 0.07;
    writeInstance(
      rx,
      ry,
      ut.size * BUFF_OVERLAY_FACTOR * rs,
      1.0,
      0.6,
      0.15,
      ampAlpha,
      (now * 0.3) % TAU,
      SH_EXPLOSION_RING,
    );
  }
  if (u.scrambleTimer > 0 && !ut.scrambles) {
    const ratio = u.scrambleTimer / SCRAMBLE_BOOST_LINGER;
    const scrAlpha = 0.15 + ratio * 0.25;
    const scrOuter = Math.max(SCRAMBLE_OVERLAY_MIN, ut.size * OVERLAY_FACTOR * rs);
    const scrInner = Math.max(SCRAMBLE_INNER_MIN, ut.size * SCRAMBLE_INNER_FACTOR * rs);
    const blink = Math.sin(now * 6) * 0.3 + 0.7;
    writeInstance(rx, ry, scrOuter, 0.8, 0.15, 0.4, scrAlpha * blink, (now * 0.8) % TAU, SH_DIAMOND_RING);
    const blink2 = Math.sin(now * 9 + 1.5) * 0.25 + 0.75;
    writeInstance(rx, ry, scrInner, 0.7, 0.15, 0.55, scrAlpha * blink2, (now * -1.2) % TAU, SH_DIAMOND_RING);
  }
  if (u.catalystTimer > 0 && !ut.catalyzes) {
    const catAlpha = 0.06 + (u.catalystTimer / CATALYST_BOOST_LINGER) * 0.06;
    const catPulse = 1 + Math.sin(now * 5) * CATALYST_PULSE_AMP;
    writeInstance(
      rx,
      ry,
      ut.size * BUFF_OVERLAY_FACTOR * rs * catPulse,
      0.2,
      0.9,
      0.4,
      catAlpha,
      (now * -0.5) % TAU,
      SH_EXPLOSION_RING,
    );
  }
}

export function renderOverlays(rx: number, ry: number, u: Unit, ut: UnitType, now: number, rs: number) {
  if (ut.shields && u.maxEnergy > 0 && u.energy > 0) {
    const alpha = 0.15 + (u.energy / u.maxEnergy) * 0.25;
    writeInstance(rx, ry, ut.size * SHIELD_ACTIVE_FACTOR * rs, 0.3, 0.6, 1, alpha, (now * 0.8) % TAU, SH_OCT_SHIELD);
  }

  if (u.shieldLingerTimer > 0) {
    writeInstance(rx, ry, ut.size * SHIELD_LINGER_FACTOR * rs, 0.3, 0.6, 1, 0.5, (now * 0.5) % TAU, SH_OCT_SHIELD);
  }
  if (u.reflectFieldHp > 0 && !ut.reflects) {
    const hpRatio = u.reflectFieldHp / REFLECT_FIELD_MAX_HP;
    writeInstance(
      rx,
      ry,
      ut.size * REFLECT_FIELD_FACTOR * rs,
      0.7,
      0.5,
      1.0,
      0.12 + hpRatio * 0.18,
      (now * 1.2) % TAU,
      SH_REFLECT_FIELD,
    );
  }
  if (ut.reflects && u.maxEnergy > 0) {
    if (u.shieldCooldown > 0) {
      const blink = Math.sin(now * 8) * 0.5 + 0.5;
      writeInstance(
        rx,
        ry,
        ut.size * REFLECT_FIELD_FACTOR * rs,
        1.0,
        0.2,
        0.2,
        0.1 + blink * 0.15,
        (now * 1.2) % TAU,
        SH_REFLECT_FIELD,
      );
    } else if (u.energy > 0) {
      const energyRatio = u.energy / u.maxEnergy;
      const baseAlpha = energyRatio * 0.2;
      writeInstance(
        rx,
        ry,
        ut.size * REFLECT_FIELD_FACTOR * rs,
        0.7,
        0.5,
        1.0,
        baseAlpha,
        (now * 1.2) % TAU,
        SH_REFLECT_FIELD,
      );
    }
  }
  renderBuffOverlays(rx, ry, u, ut, now, rs);
}

export function renderCatalystGhosts(rx: number, ry: number, u: Unit, ut: UnitType, c: Color3, rs: number) {
  const spd = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
  const trailLen = Math.max(ut.size * GHOST_TRAIL_MIN_FACTOR, spd * GHOST_TRAIL_SPD_FACTOR);
  const ratio = u.catalystTimer / CATALYST_BOOST_LINGER;
  const invSpd = spd > SPEED_EPSILON ? 1 / spd : 0;
  if (invSpd === 0) {
    return;
  }
  const nx = u.vx * invSpd;
  const ny = u.vy * invSpd;

  // ゴーストトレイル全体が画面外なら個別ループに入らず即 return
  const tailX = rx - nx * trailLen;
  const tailY = ry - ny * trailLen;
  if (!isSegmentVisible(rx, ry, tailX, tailY, ut.size * rs)) {
    return;
  }

  const gr = c[0] * (1 - GHOST_GREEN_TINT) + 0.2 * GHOST_GREEN_TINT;
  const gg = c[1] * (1 - GHOST_GREEN_TINT) + 0.9 * GHOST_GREEN_TINT;
  const gb = c[2] * (1 - GHOST_GREEN_TINT) + 0.4 * GHOST_GREEN_TINT;

  for (let i = 1; i <= GHOST_COUNT; i++) {
    const dist = (i * trailLen) / GHOST_COUNT;
    const gx = rx - nx * dist;
    const gy = ry - ny * dist;
    const ghostSize = ut.size * (1 - i * GHOST_SIZE_DECAY) * rs;
    if (!isCircleVisible(gx, gy, ghostSize)) {
      continue;
    }
    const ghostAlpha = ratio * GHOST_BASE_ALPHA * (1 - i / (GHOST_COUNT + 1));
    writeInstance(gx, gy, ghostSize, gr, gg, gb, ghostAlpha, u.angle, ut.shape);
  }
}

export function renderVetSwarmOverlays(
  rx: number,
  ry: number,
  u: Unit,
  ut: UnitType,
  c: Color3,
  now: number,
  rs: number,
) {
  if (u.vet > 0) {
    const pulse = 1 + Math.sin(now * 4) * VET_PULSE_AMP;
    const vetSize = ut.size * (VET_OVERLAY_BASE + u.vet * VET_OVERLAY_PER_LEVEL) * rs * pulse;
    const vetAlpha = 0.1 + u.vet * 0.08;
    writeOverlay(rx, ry, vetSize, 1, 0.9, 0.3, vetAlpha, SH_EXPLOSION_RING);
  }
  if (u.swarmN > 0) {
    writeOverlay(rx, ry, ut.size * OVERLAY_FACTOR * rs, c[0], c[1], c[2], 0.06 + u.swarmN * 0.03, SH_EXPLOSION_RING);
  }
}
