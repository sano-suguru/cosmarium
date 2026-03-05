import { beams, getBeam, getTrackingBeam, trackingBeams } from '../beams.ts';
import { color } from '../colors.ts';
import {
  AMP_BOOST_LINGER,
  CATALYST_BOOST_LINGER,
  REFLECT_FIELD_MAX_HP,
  SCRAMBLE_BOOST_LINGER,
  SH_BAR,
  SH_BEAM,
  SH_CIRCLE,
  SH_DIAMOND,
  SH_DIAMOND_RING,
  SH_EXPLOSION_RING,
  SH_HOMING,
  SH_LIGHTNING,
  SH_OCT_SHIELD,
  SH_REFLECT_FIELD,
  TAU,
  WORLD_SIZE,
} from '../constants.ts';
import { lerpX, lerpY } from '../interpolation.ts';
import { getParticleHWM, getProjectileHWM, getUnitHWM, particle, poolCounts, projectile, unit } from '../pools.ts';
import type { Beam, Color3, Unit, UnitType } from '../types.ts';
import { devWarn } from '../ui/dev-overlay.ts';
import { unitType } from '../unit-types.ts';
import { BEAM_ALPHA, BEAM_MAX_WIDTH_SCALE, beamFlicker, beamSegmentCount, beamWidthScale } from './beam-segment.ts';
import { instanceData, instanceDataI32, MAX_INSTANCES, writeSlots } from './buffers.ts';
import { renderSquadronTethers } from './squadron-tether.ts';

const VET_TINT_FACTOR = 0.15;
/** vet リングの基本サイズ倍率 */
const VET_OVERLAY_BASE = 1.4;
/** vet レベルあたりの追加サイズ倍率 */
const VET_OVERLAY_PER_LEVEL = 0.3;
/** vet リングのパルス振幅 */
const VET_PULSE_AMP = 0.1;
// TAU multiple keeps sin(now*N) continuous at wrap boundary; ×10000 ≈ 17.5h before reset
export const WRAP_PERIOD = TAU * 10000;

/** scramble outer overlay の固定最小サイズ (renderBuffOverlays 内の Math.max(30, ...) と対応) */
const SCRAMBLE_OVERLAY_MIN = 30;
/** scramble inner overlay の固定最小サイズ */
const SCRAMBLE_INNER_MIN = 22;
/** HP バー・スタンスター等の追加余白 */
const UNIT_EXTRA_MARGIN = 10;
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
const OVERLAY_FACTOR = 2.2;
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

/** 爆発リングの寿命初期サイズ倍率 */
const EXPLOSION_RING_INITIAL_SCALE = 2.2;
/** 爆発リングの寿命減衰係数 */
const EXPLOSION_RING_DECAY = 1.7;

/** ライトニングビームの垂直逸脱倍率 */
const LIGHTNING_DEVIATION_FACTOR = 4;

/**
 * カリング境界 — renderScene() のみが毎フレーム設定するモジュールレベル状態。
 * _writer と同様、JS シングルスレッド実行で安全。renderScene 以外から書き換えてはならない。
 */
let _cullMinX = 0;
let _cullMaxX = 0;
let _cullMinY = 0;
let _cullMaxY = 0;

const _writer = { idx: 0, overflowWarned: false };

function writeInstance(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number,
) {
  if (_writer.idx < MAX_INSTANCES) {
    writeSlots(instanceData, instanceDataI32, _writer.idx * 9, x, y, size, r, g, b, a, angle, shape);
    _writer.idx++;
  } else if (!_writer.overflowWarned) {
    devWarn(`writeInstance: idx(${_writer.idx}) >= MAX_INSTANCES(${MAX_INSTANCES}), drawing skipped`);
    _writer.overflowWarned = true;
  }
}

function writeOverlay(x: number, y: number, size: number, r: number, g: number, b: number, a: number, shape: number) {
  writeInstance(x, y, size, r, g, b, a, 0, shape);
}

function writeParticle(x: number, y: number, size: number, r: number, g: number, b: number, a: number, shape: number) {
  writeInstance(x, y, size, r, g, b, a, 0, shape);
}

function writeBeam(
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shape: number = SH_BEAM,
) {
  writeInstance(x, y, size, r, g, b, a, angle, shape);
}

/** Minimum world-size for rendering so small-unit SDF details stay visible. */
const MIN_RENDER_SIZE = 10;

// 最大距離 = WORLD_SIZE*2*sqrt(2), ステップ幅8px
const MAX_LIGHTNING_STEPS = ((WORLD_SIZE * 2 * Math.SQRT2) / 8) | 0;
const _lightningPts = new Float64Array((MAX_LIGHTNING_STEPS + 1) * 2);

function renderStunStars(rx: number, ry: number, u: Unit, ut: UnitType, now: number, rs: number) {
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

function renderHpBar(rx: number, ry: number, u: Unit, ut: UnitType, rs: number) {
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

function renderOverlays(rx: number, ry: number, u: Unit, ut: UnitType, now: number, rs: number) {
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

const GHOST_COUNT = 5;
const GHOST_GREEN_TINT = 0.3;
const GHOST_BASE_ALPHA = 0.3;
const GHOST_SIZE_DECAY = 0.08;
const GHOST_TRAIL_SPD_FACTOR = 0.12;
const GHOST_TRAIL_MIN_FACTOR = 2.0;

const SPEED_EPSILON = 0.001;

function renderCatalystGhosts(rx: number, ry: number, u: Unit, ut: UnitType, c: Color3, rs: number) {
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

function renderVetSwarmOverlays(rx: number, ry: number, u: Unit, ut: UnitType, c: Color3, now: number, rs: number) {
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

function renderUnits(now: number) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    if (u.blinkPhase === 1) {
      continue;
    }
    const ut = unitType(u.type);
    const rs = Math.max(MIN_RENDER_SIZE, ut.size) / ut.size;
    const c = color(u.type, u.team);
    const rx = lerpX(u);
    const ry = lerpY(u);

    // ゴーストトレイルは速度依存でユニット半径外に伸びるため、個別にカリング
    if (u.catalystTimer > 0 && !ut.catalyzes) {
      renderCatalystGhosts(rx, ry, u, ut, c, rs);
    }

    const unitR = Math.max(SCRAMBLE_OVERLAY_MIN, ut.size * OVERLAY_FACTOR * rs) + UNIT_EXTRA_MARGIN;
    if (!isCircleVisible(rx, ry, unitR)) {
      continue;
    }
    const hr = u.hp / u.maxHp;
    const flash = hr < 0.3 ? Math.sin(now * 15) * 0.3 + 0.7 : 1;
    const sf = u.stun > 0 ? Math.sin(now * 25) * 0.3 + 0.5 : 1;

    renderOverlays(rx, ry, u, ut, now, rs);
    renderStunStars(rx, ry, u, ut, now, rs);
    renderVetSwarmOverlays(rx, ry, u, ut, c, now, rs);
    const vetTint = u.vet * VET_TINT_FACTOR; // max 0.3 (vet ≤ 2), clamp不要
    const vr0 = (c[0] + (1 - c[0]) * vetTint) * flash * sf;
    const vg0 = (c[1] + (0.9 - c[1]) * vetTint) * flash * sf;
    const vb0 = (c[2] + (0.3 - c[2]) * vetTint) * flash * sf;
    const hf = u.hitFlash;
    const vr = vr0 + (1 - vr0) * hf;
    const vg = vg0 + (1 - vg0) * hf;
    const vb = vb0 + (1 - vb0) * hf;
    writeInstance(rx, ry, ut.size * rs, vr, vg, vb, 0.9, u.angle, ut.shape);
    renderHpBar(rx, ry, u, ut, rs);
  }
}

function renderParticles() {
  for (let i = 0, rem = poolCounts.particles; i < getParticleHWM() && rem > 0; i++) {
    const p = particle(i);
    if (!p.alive) {
      continue;
    }
    rem--;
    const px = lerpX(p);
    const py = lerpY(p);
    const al = Math.min(1, p.life / p.maxLife);
    let size = p.size * (0.5 + al * 0.5);
    const shape = p.shape;
    if (shape === SH_EXPLOSION_RING) {
      size = p.size * (EXPLOSION_RING_INITIAL_SCALE - al * EXPLOSION_RING_DECAY);
    }
    if (!isCircleVisible(px, py, size)) {
      continue;
    }
    writeParticle(px, py, size, p.r * al, p.g * al, p.b * al, al * 0.8, shape);
  }
}

function computeTaperScale(tail: number): number {
  if (tail === 0) {
    return 0.25;
  }
  if (tail === 1) {
    return 0.5;
  }
  if (tail === 2) {
    return 0.8;
  }
  return 1;
}

function renderLightningBeam(bm: Beam, now: number, al: number, dx: number, dy: number, d: number, ang: number) {
  const lSteps = Math.min(MAX_LIGHTNING_STEPS, Math.max(3, (d / 8) | 0));
  const perpX = -Math.sin(ang),
    perpY = Math.cos(ang);
  let ptsLen = 0;
  for (let j = 0; j <= lSteps; j++) {
    const t = j / lSteps;
    let off = 0;
    if (j > 0 && j < lSteps) {
      const h = Math.sin(j * 127.1 + now * 40) * 43758.5;
      const rnd = h - Math.floor(h);
      off = (rnd * 2 - 1) * bm.width * LIGHTNING_DEVIATION_FACTOR;
    }
    _lightningPts[ptsLen++] = bm.x1 + dx * t + perpX * off;
    _lightningPts[ptsLen++] = bm.y1 + dy * t + perpY * off;
  }
  for (let j = 0; j < lSteps; j++) {
    const x0 = _lightningPts[j * 2] as number,
      y0 = _lightningPts[j * 2 + 1] as number;
    const x1 = _lightningPts[j * 2 + 2] as number,
      y1 = _lightningPts[j * 2 + 3] as number;
    const mx = (x0 + x1) * 0.5,
      my = (y0 + y1) * 0.5;
    const segDx = x1 - x0,
      segDy = y1 - y0;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
    const segAng = Math.atan2(segDy, segDx);
    const fl = 0.8 + Math.sin(j * 5.0 + now * 55) * 0.2;
    const white = 0.5 + al * 0.5;
    writeBeam(
      mx,
      my,
      segLen * 0.6,
      (bm.r * 0.4 + white * 0.6) * al * fl,
      (bm.g * 0.4 + white * 0.6) * al * fl,
      (bm.b * 0.4 + white * 0.6) * al * fl,
      al * 0.9,
      segAng,
      SH_LIGHTNING,
    );
  }
}

function isCircleVisible(x: number, y: number, r: number): boolean {
  return x + r >= _cullMinX && x - r <= _cullMaxX && y + r >= _cullMinY && y - r <= _cullMaxY;
}

function isSegmentVisible(x1: number, y1: number, x2: number, y2: number, hw: number): boolean {
  const bMinX = (x1 < x2 ? x1 : x2) - hw;
  const bMaxX = (x1 > x2 ? x1 : x2) + hw;
  const bMinY = (y1 < y2 ? y1 : y2) - hw;
  const bMaxY = (y1 > y2 ? y1 : y2) + hw;
  return bMaxX >= _cullMinX && bMinX <= _cullMaxX && bMaxY >= _cullMinY && bMinY <= _cullMaxY;
}

function renderTrackingBeams(now: number) {
  for (let i = 0; i < trackingBeams.length; i++) {
    const tb = getTrackingBeam(i);
    const al = tb.life / tb.maxLife;
    const src = unit(tb.srcUnit);
    const tgt = unit(tb.tgtUnit);
    const x1 = src.alive ? lerpX(src) : tb.x1;
    const y1 = src.alive ? lerpY(src) : tb.y1;
    const x2 = tgt.alive ? lerpX(tgt) : tb.x2;
    const y2 = tgt.alive ? lerpY(tgt) : tb.y2;
    if (!isSegmentVisible(x1, y1, x2, y2, tb.width * BEAM_MAX_WIDTH_SCALE)) {
      continue;
    }
    const dx = x2 - x1,
      dy = y2 - y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = beamSegmentCount(d);
    const ang = Math.atan2(dy, dx);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const fl = beamFlicker(j, now);
      writeBeam(
        x1 + dx * t,
        y1 + dy * t,
        tb.width * beamWidthScale(j, now),
        tb.r * al * fl,
        tb.g * al * fl,
        tb.b * al * fl,
        al * BEAM_ALPHA,
        ang,
      );
    }
  }
}

function renderBeams(now: number) {
  for (let i = 0; i < beams.length; i++) {
    const bm = getBeam(i);
    const beamHW = bm.lightning ? bm.width * LIGHTNING_DEVIATION_FACTOR : bm.width * BEAM_MAX_WIDTH_SCALE;
    if (!isSegmentVisible(bm.x1, bm.y1, bm.x2, bm.y2, beamHW)) {
      continue;
    }
    const al = bm.life / bm.maxLife;
    const dx = bm.x2 - bm.x1,
      dy = bm.y2 - bm.y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = beamSegmentCount(d, bm.stepDiv);
    const ang = Math.atan2(dy, dx);
    if (bm.lightning) {
      renderLightningBeam(bm, now, al, dx, dy, d, ang);
    } else {
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const fl = beamFlicker(j, now);
        const tipScale = bm.tapered ? computeTaperScale(steps - j) : 1;
        writeBeam(
          bm.x1 + dx * t,
          bm.y1 + dy * t,
          bm.width * beamWidthScale(j, now) * tipScale,
          bm.r * al * fl,
          bm.g * al * fl,
          bm.b * al * fl,
          al * BEAM_ALPHA,
          ang,
        );
      }
    }
  }
  renderTrackingBeams(now);
  renderSquadronTethers(now, writeBeam, isSegmentVisible);
}

/**
 * プロジェクタイル描画。カリングは pr.size のみで十分:
 * SH_CIRCLE/SH_DIAMOND/SH_HOMING はすべてクワッド正規化距離 √2 でほぼゼロ alpha
 * (smoothstep(1.0,0.6,d)=0, exp(-d*2)*0.4≈0.024) のため、追加マージン不要。
 */
function renderProjectiles() {
  for (let i = 0, rem = poolCounts.projectiles; i < getProjectileHWM() && rem > 0; i++) {
    const pr = projectile(i);
    if (!pr.alive) {
      continue;
    }
    rem--;
    const prx = lerpX(pr);
    const pry = lerpY(pr);
    if (!isCircleVisible(prx, pry, pr.size)) {
      continue;
    }
    let shape: number;
    const size = pr.size;
    if (pr.homing) {
      shape = SH_HOMING;
    } else if (pr.aoe > 0) {
      shape = SH_CIRCLE;
    } else {
      shape = SH_DIAMOND;
    }
    writeInstance(prx, pry, size, pr.r, pr.g, pr.b, 1, Math.atan2(pr.vy, pr.vx), shape);
  }
}

export function renderScene(now: number, cx: number, cy: number, cz: number, vW: number, vH: number): number {
  _writer.idx = 0;
  const t = now % WRAP_PERIOD;

  const halfW = vW / (2 * cz);
  const halfH = vH / (2 * cz);
  _cullMinX = cx - halfW;
  _cullMaxX = cx + halfW;
  _cullMinY = cy - halfH;
  _cullMaxY = cy + halfH;

  renderParticles();
  renderBeams(t);
  renderProjectiles();
  renderUnits(t);

  return _writer.idx;
}
