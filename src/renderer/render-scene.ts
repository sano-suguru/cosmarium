import { color } from '../colors.ts';
import { SH_CIRCLE, SH_DIAMOND, SH_EXPLOSION_RING, SH_HOMING, SH_TRAIL } from '../constants.ts';
import { lerpX, lerpY } from '../interpolation.ts';
import { getParticleHWM, getProjectileHWM, getUnitHWM, poolCounts } from '../pools.ts';
import { particle, projectile, unit } from '../pools-query.ts';
import type { Color3, Unit, UnitType } from '../types.ts';
import { unitType } from '../unit-type-accessors.ts';
import { renderBeams } from './render-beams.ts';
import {
  OVERLAY_FACTOR,
  renderCatalystGhosts,
  renderHpBar,
  renderOverlays,
  renderStunStars,
  renderVetSwarmOverlays,
  SCRAMBLE_OVERLAY_MIN,
} from './render-overlays.ts';
import {
  beginFrame,
  getInstanceCount,
  isCircleVisible,
  setCullBounds,
  WRAP_PERIOD,
  writeInstance,
} from './render-write.ts';

const VET_TINT_FACTOR = 0.15;
/** HP バー・スタンスター等の追加余白 */
const UNIT_EXTRA_MARGIN = 10;

/** Minimum world-size for rendering so small-unit SDF details stay visible. */
const MIN_RENDER_SIZE = 10;

/** 爆発リングの寿命初期サイズ倍率 */
const EXPLOSION_RING_INITIAL_SCALE = 2.2;
/** 爆発リングの寿命減衰係数 */
const EXPLOSION_RING_DECAY = 1.7;

let _cr = 0;
let _cg = 0;
let _cb = 0;
function computeUnitColor(c: Color3, vet: number, hpRatio: number, stun: number, hitFlash: number, now: number) {
  const flash = hpRatio < 0.3 ? Math.sin(now * 15) * 0.3 + 0.7 : 1;
  const sf = stun > 0 ? Math.sin(now * 25) * 0.3 + 0.5 : 1;
  const vetTint = vet * VET_TINT_FACTOR;
  const r0 = (c[0] + (1 - c[0]) * vetTint) * flash * sf;
  const g0 = (c[1] + (0.9 - c[1]) * vetTint) * flash * sf;
  const b0 = (c[2] + (0.3 - c[2]) * vetTint) * flash * sf;
  _cr = r0 + (1 - r0) * hitFlash;
  _cg = g0 + (1 - g0) * hitFlash;
  _cb = b0 + (1 - b0) * hitFlash;
}

/** 可視判定 + ユニット描画パイプライン（オーバーレイ・スタン・ベテラン・本体・HPバー） */
function renderUnitIfVisible(rx: number, ry: number, u: Unit, ut: UnitType, c: Color3, rs: number, now: number) {
  const unitR = Math.max(SCRAMBLE_OVERLAY_MIN, ut.size * OVERLAY_FACTOR * rs) + UNIT_EXTRA_MARGIN;
  if (!isCircleVisible(rx, ry, unitR)) {
    return;
  }
  renderOverlays(rx, ry, u, ut, now, rs);
  renderStunStars(rx, ry, u, ut, now, rs);
  renderVetSwarmOverlays(rx, ry, u, ut, c, now, rs);
  computeUnitColor(c, u.vet, u.hp / u.maxHp, u.stun, u.hitFlash, now);
  writeInstance(rx, ry, ut.size * rs, _cr, _cg, _cb, 0.9, u.angle, ut.shape);
  renderHpBar(rx, ry, u, ut, rs);
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

    renderUnitIfVisible(rx, ry, u, ut, c, rs, now);
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
    const angle = shape === SH_TRAIL ? Math.atan2(p.vy, p.vx) : 0;
    writeInstance(px, py, size, p.r * al, p.g * al, p.b * al, al * 0.8, angle, shape);
  }
}

/**
 * プロジェクタイル描画。カリングは pr.size のみで十分:
 * SH_CIRCLE/SH_DIAMOND/SH_HOMING はすべてクワッド正規化距離 √2 でほぼゼロ alpha
 * (smoothstep(1.0,0.6,d)=0, exp(-d*2)*0.4≈0.024) のため、追加マージン不要。
 */
function projectileShape(homing: boolean, aoe: number): number {
  if (homing) {
    return SH_HOMING;
  }
  if (aoe > 0) {
    return SH_CIRCLE;
  }
  return SH_DIAMOND;
}

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
    const shape = projectileShape(pr.homing, pr.aoe);
    writeInstance(prx, pry, pr.size, pr.r, pr.g, pr.b, 1, Math.atan2(pr.vy, pr.vx), shape);
  }
}

export function renderScene(now: number, cx: number, cy: number, cz: number, vW: number, vH: number): number {
  beginFrame();
  const t = now % WRAP_PERIOD;

  const halfW = vW / (2 * cz);
  const halfH = vH / (2 * cz);
  setCullBounds(cx - halfW, cx + halfW, cy - halfH, cy + halfH);

  renderParticles();
  renderBeams(t);
  renderProjectiles();
  renderUnits(t);

  return getInstanceCount();
}
