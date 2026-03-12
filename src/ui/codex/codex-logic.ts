import { beams, trackingBeams } from '../../beams.ts';
import { isPurchasable } from '../../fleet-cost.ts';
import type { CameraSnapshot } from '../../input/camera.ts';
import { restoreCamera, snapCamera, snapshotCamera, updateDemoCamera } from '../../input/camera.ts';
import type { PoolCountsState } from '../../pools.ts';
import {
  clearAllPools,
  getParticleHWM,
  getProjectileHWM,
  getUnitHWM,
  mothershipIdx,
  poolCounts,
  restoreHWM,
  setPoolCounts,
  teamUnitCounts,
} from '../../pools.ts';
import { particle, projectile, unit } from '../../pools-query.ts';
import { resetChains, restoreChains, snapshotChains } from '../../simulation/chain-lightning.ts';
import { demoFlag } from '../../simulation/combat.ts';
import { spawnUnit } from '../../simulation/spawn.ts';
import { restoreSquadrons, snapshotSquadrons } from '../../simulation/squadron.ts';
import { state } from '../../state.ts';
import { copyTeamCounts, copyTeamTuple } from '../../team.ts';
import type { Beam, Particle, Projectile, TrackingBeam, Unit, UnitIndex, UnitTypeIndex } from '../../types.ts';
import { NO_UNIT } from '../../types.ts';
import { DEFAULT_UNIT_TYPE, unitType } from '../../unit-type-accessors.ts';
import { demoByFlag, demoDefault, demoRng } from '../codex-demos.ts';
import { clearKillFeed } from '../kill-feed/KillFeed.tsx';

let codexDemoTimer = 0;
let cameraSnapshotBeforeCodex: CameraSnapshot | null = null;

interface PoolSnapshot {
  units: Array<{ index: number; copy: Unit }>;
  particles: Array<{ index: number; copy: Particle }>;
  projectiles: Array<{ index: number; copy: Projectile }>;
  beams: Beam[];
  trackingBeams: TrackingBeam[];
  pendingChains: ReturnType<typeof snapshotChains>;
  counts: PoolCountsState;
  hwm: { units: number; particles: number; projectiles: number };
}

let poolSnapshot: PoolSnapshot | null = null;

/** 全プール状態のスナップショット。全フィールドはプリミティブ型（検証済み）のため shallow copy で安全。新フィールド追加時は参照型でないことを確認すること */
export function snapshotPools(): PoolSnapshot {
  snapshotSquadrons();
  const unitHWM = getUnitHWM();
  const particleHWM = getParticleHWM();
  const projectileHWM = getProjectileHWM();
  const units: PoolSnapshot['units'] = [];
  for (let i = 0; i < unitHWM; i++) {
    const u = unit(i);
    if (u.alive) {
      units.push({ index: i, copy: { ...u } });
    }
  }
  const particles: PoolSnapshot['particles'] = [];
  for (let i = 0; i < particleHWM; i++) {
    const p = particle(i);
    if (p.alive) {
      particles.push({ index: i, copy: { ...p } });
    }
  }
  const projectiles: PoolSnapshot['projectiles'] = [];
  for (let i = 0; i < projectileHWM; i++) {
    const p = projectile(i);
    if (p.alive) {
      projectiles.push({ index: i, copy: { ...p } });
    }
  }
  return {
    units,
    particles,
    projectiles,
    beams: beams.map((b) => ({ ...b })),
    trackingBeams: trackingBeams.map((tb) => ({ ...tb })),
    pendingChains: snapshotChains(),
    counts: {
      units: poolCounts.units,
      particles: poolCounts.particles,
      projectiles: poolCounts.projectiles,
      teamUnits: copyTeamCounts(teamUnitCounts),
      mothershipIndices: copyTeamTuple<UnitIndex>(mothershipIdx),
    },
    hwm: { units: unitHWM, particles: particleHWM, projectiles: projectileHWM },
  };
}

export function restorePools(snapshot: PoolSnapshot) {
  clearAllPools();
  restoreSquadrons();
  restoreChains(snapshot.pendingChains);
  for (const entry of snapshot.units) {
    Object.assign(unit(entry.index), entry.copy);
  }
  for (const entry of snapshot.particles) {
    Object.assign(particle(entry.index), entry.copy);
  }
  for (const entry of snapshot.projectiles) {
    Object.assign(projectile(entry.index), entry.copy);
  }
  for (const b of snapshot.beams) {
    beams.push(b);
  }
  for (const tb of snapshot.trackingBeams) {
    trackingBeams.push(tb);
  }
  setPoolCounts(snapshot.counts);
  restoreHWM(snapshot.hwm.units, snapshot.hwm.particles, snapshot.hwm.projectiles);
}

function clearCurrentDemo() {
  clearAllPools();
  resetChains();
  codexDemoTimer = 0;
}

function closeCodex() {
  if (!state.codexOpen) {
    return;
  }
  if (poolSnapshot) {
    restorePools(poolSnapshot);
    poolSnapshot = null;
  }
  codexDemoTimer = 0;
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
    clearKillFeed();
    cameraSnapshotBeforeCodex = snapshotCamera();
    poolSnapshot = snapshotPools();
    state.codexOpen = true;
    if (!isPurchasable(state.codexSelected)) {
      state.codexSelected = DEFAULT_UNIT_TYPE;
    }
    setupCodexDemo(state.codexSelected);
    snapCamera();
  }
}
