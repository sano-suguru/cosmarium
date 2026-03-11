import { color } from '../colors.ts';
import { SH_CIRCLE, SH_DIAMOND, SH_EXPLOSION_RING, SH_HOMING, SH_TRAIL } from '../constants.ts';
import { lerpX, lerpY } from '../interpolation.ts';
import { getParticleHWM, getProjectileHWM, getUnitHWM, particle, poolCounts, projectile, unit } from '../pools.ts';
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
    const angle = shape === SH_TRAIL ? Math.atan2(p.vy, p.vx) : 0;
    writeInstance(px, py, size, p.r * al, p.g * al, p.b * al, al * 0.8, angle, shape);
  }
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
