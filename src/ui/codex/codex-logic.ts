import { isPurchasable } from '../../fleet-cost.ts';
import type { CameraSnapshot } from '../../input/camera.ts';
import { restoreCamera, snapCamera, snapshotCamera, updateDemoCamera } from '../../input/camera.ts';
import { clearAllPools, getUnitHWM, poolCounts } from '../../pools.ts';
import { unit } from '../../pools-query.ts';
import { resetChains } from '../../simulation/chain-lightning.ts';
import { demoFlag } from '../../simulation/combat.ts';
import { spawnUnit } from '../../simulation/spawn.ts';
import { state } from '../../state.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { NO_UNIT } from '../../types.ts';
import { DEFAULT_UNIT_TYPE, unitType } from '../../unit-type-accessors.ts';
import { demoByFlag, demoDefault, demoRng } from '../codex-demos.ts';
import { clearKillFeed } from '../kill-feed/KillFeed.tsx';

let codexDemoTimer = 0;
let cameraSnapshotBeforeCodex: CameraSnapshot | null = null;

function clearCurrentDemo() {
  clearAllPools();
  resetChains();
  codexDemoTimer = 0;
}

function closeCodex() {
  if (!state.codexOpen) {
    return;
  }
  clearCurrentDemo();
  state.codexOpen = false;
  if (cameraSnapshotBeforeCodex) {
    restoreCamera(cameraSnapshotBeforeCodex);
    cameraSnapshotBeforeCodex = null;
  }
}

function countDemoEnemies(): number {
  let ec = 0;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    if (u.team === 1) {
      ec++;
    }
  }
  return ec;
}

function setupCodexDemo(typeIdx: UnitTypeIndex) {
  clearCurrentDemo();

  const t = unitType(typeIdx);
  const mi = spawnUnit(0, typeIdx, 0, 0, demoRng);
  if (mi !== NO_UNIT) {
    unit(mi).angle = 0;
  }

  let matched = false;
  const dominant = demoFlag(t);
  if (dominant !== null) {
    demoByFlag[dominant](mi);
    matched = true;
  }
  if (!matched) {
    demoDefault(t);
  }

  const bounds = computeDemoBounds();
  updateDemoCamera(bounds);
}

function maxUnitDist(cx: number, cy: number): number {
  let maxDist = 0;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    const dist = Math.hypot(u.x - cx, u.y - cy);
    if (dist > maxDist) {
      maxDist = dist;
    }
  }
  return maxDist;
}

export function computeDemoBounds(): { cx: number; cy: number; radius: number } {
  let count = 0;
  let sx = 0;
  let sy = 0;

  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    sx += u.x;
    sy += u.y;
    count += 1;
  }

  if (count === 0) {
    return { cx: 0, cy: 0, radius: 100 };
  }

  const cx = sx / count;
  const cy = sy / count;
  const radius = Math.max(80, maxUnitDist(cx, cy) + 50);
  return { cx, cy, radius };
}

function checkDemoRespawn(): void {
  if (codexDemoTimer > 3) {
    codexDemoTimer = 0;
    const ec = countDemoEnemies();
    if (ec < 2) {
      setupCodexDemo(state.codexSelected);
    }
  }
}

export function updateCodexDemo(dt: number) {
  codexDemoTimer += dt;
  checkDemoRespawn();
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    if (u.team === 0 && !unitType(u.type).rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    // swarmユニット(Drone)はHP回復スキップ: 自然に倒され数が制限される
    if (!unitType(u.type).swarm) {
      u.hp = Math.min(u.maxHp, u.hp + dt * 2);
    }
  }
}

export function syncDemoCamera(): void {
  const bounds = computeDemoBounds();
  updateDemoCamera(bounds);
}

export function selectCodexUnit(idx: UnitTypeIndex) {
  state.codexSelected = idx;
  setupCodexDemo(idx);
}

export function toggleCodex() {
  if (state.codexOpen) {
    closeCodex();
    clearKillFeed();
  } else {
    if (state.gameState !== 'menu' && state.gameState !== 'compose') {
      throw new Error(`toggleCodex called in invalid gameState: ${state.gameState}`);
    }
    clearKillFeed();
    cameraSnapshotBeforeCodex = snapshotCamera();
    state.codexOpen = true;
    if (!isPurchasable(state.codexSelected)) {
      state.codexSelected = DEFAULT_UNIT_TYPE;
    }
    setupCodexDemo(state.codexSelected);
    snapCamera();
  }
}
