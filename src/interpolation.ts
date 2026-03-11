import { getParticleHWM, getProjectileHWM, getUnitHWM, poolCounts } from './pools.ts';
import { particle, projectile, unit } from './pools-query.ts';

/**
 * 描画補間係数 (0–1)。Gaffer-on-Games "Fix Your Timestep!" パターンに準拠。
 * 最大 1 SIM_DT（≈16.7ms）の視覚遅延が生じるが、人間の知覚閾値以下。
 * 60Hz では恩恵は限定的だが、120Hz+ ディスプレイで正しく機能する。
 */
let interpAlpha = 0;

export function setInterpAlpha(alpha: number): void {
  interpAlpha = alpha;
}

/** テスト用リセット */
export function resetInterp(): void {
  interpAlpha = 0;
}

/** エンティティの補間 X 座標を返す。prevX/x を持つ任意のオブジェクトに適用可能。 */
export function lerpX(e: { prevX: number; x: number }): number {
  return e.prevX + (e.x - e.prevX) * interpAlpha;
}

/** エンティティの補間 Y 座標を返す。prevY/y を持つ任意のオブジェクトに適用可能。 */
export function lerpY(e: { prevY: number; y: number }): number {
  return e.prevY + (e.y - e.prevY) * interpAlpha;
}

/** シミュレーションステップ直前に全生存エンティティの現在位置を prevX/prevY に保存する */
export function savePrevPositions(): void {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    u.prevX = u.x;
    u.prevY = u.y;
  }
  for (let i = 0, rem = poolCounts.projectiles; i < getProjectileHWM() && rem > 0; i++) {
    const p = projectile(i);
    if (!p.alive) {
      continue;
    }
    rem--;
    p.prevX = p.x;
    p.prevY = p.y;
  }
  for (let i = 0, rem = poolCounts.particles; i < getParticleHWM() && rem > 0; i++) {
    const p = particle(i);
    if (!p.alive) {
      continue;
    }
    rem--;
    p.prevX = p.x;
    p.prevY = p.y;
  }
}
