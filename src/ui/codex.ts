import { beams, trackingBeams } from '../beams.ts';
import { color } from '../colors.ts';
import type { CameraSnapshot } from '../input/camera.ts';
import { restoreCamera, snapCamera, snapshotCamera, updateDemoCamera } from '../input/camera.ts';
import {
  clearAllPools,
  getParticleHWM,
  getProjectileHWM,
  getUnitHWM,
  particle,
  poolCounts,
  projectile,
  restoreHWM,
  setPoolCounts,
  teamUnitCounts,
  unit,
} from '../pools.ts';
import { demoFlag } from '../simulation/combat.ts';
import { resetChains, restoreChains, snapshotChains } from '../simulation/effects.ts';
import { spawnUnit } from '../simulation/spawn.ts';
import { restoreSquadrons, snapshotSquadrons } from '../simulation/squadron.ts';
import { state } from '../state.ts';
import type { Beam, Particle, Projectile, TeamCounts, TrackingBeam, Unit } from '../types.ts';
import { copyTeamCounts, NO_UNIT } from '../types.ts';
import { TYPES, unitType } from '../unit-types.ts';
import { demoByFlag, demoDefault, demoRng } from './codex-demos.ts';
import {
  DOM_ID_CODEX,
  DOM_ID_CODEX_DESC,
  DOM_ID_CODEX_LIST,
  DOM_ID_CODEX_NAME,
  DOM_ID_CODEX_STATS,
} from './dom-ids.ts';
import { getElement } from './dom-util.ts';

import { clearKillFeed } from './kill-feed.ts';

interface CodexEls {
  readonly codex: HTMLElement;
  readonly codexName: HTMLElement;
  readonly codexDesc: HTMLElement;
  readonly codexStats: HTMLElement;
  readonly codexList: HTMLElement;
}

let _els: CodexEls | null = null;

function els(): CodexEls {
  if (!_els) {
    throw new Error('initCodexDOM() has not been called');
  }
  return _els;
}

let codexDemoTimer = 0;
let cameraSnapshotBeforeCodex: CameraSnapshot | null = null;

interface PoolSnapshot {
  units: Array<{ index: number; copy: Unit }>;
  particles: Array<{ index: number; copy: Particle }>;
  projectiles: Array<{ index: number; copy: Projectile }>;
  beams: Beam[];
  trackingBeams: TrackingBeam[];
  pendingChains: ReturnType<typeof snapshotChains>;
  counts: { units: number; particles: number; projectiles: number; teamUnits: TeamCounts };
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
  setPoolCounts(
    snapshot.counts.units,
    snapshot.counts.particles,
    snapshot.counts.projectiles,
    snapshot.counts.teamUnits,
  );
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
  els().codex.classList.remove('open');
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

function setupCodexDemo(typeIdx: number) {
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

  let maxDist = 0;
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    const dx = u.x - cx;
    const dy = u.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      maxDist = dist;
    }
  }

  const radius = Math.max(80, maxDist + 50);
  return { cx, cy, radius };
}

export function updateCodexDemo(dt: number) {
  codexDemoTimer += dt;
  if (codexDemoTimer > 3) {
    codexDemoTimer = 0;
    const ec = countDemoEnemies();
    if (ec < 2) {
      setupCodexDemo(state.codexSelected);
    }
  }
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

function updateCodexPanel() {
  const d = els();
  const t = unitType(state.codexSelected);
  const c0 = color(state.codexSelected, 0),
    c1 = color(state.codexSelected, 1);
  const col = `rgb(${(c0[0] * 255) | 0},${(c0[1] * 255) | 0},${(c0[2] * 255) | 0})`;
  const col2 = `rgb(${(c1[0] * 255) | 0},${(c1[1] * 255) | 0},${(c1[2] * 255) | 0})`;
  d.codexName.textContent = t.name;
  d.codexName.style.color = col;
  d.codexDesc.textContent = t.description;

  const mkBar = (label: string, current: number, max: number, color: string): DocumentFragment => {
    const frag = document.createDocumentFragment();
    const lbl = document.createElement('div');
    lbl.textContent = `${label}: ${current}`;
    frag.appendChild(lbl);
    const barOuter = document.createElement('div');
    barOuter.className = 'cpBar';
    const barInner = document.createElement('div');
    barInner.style.width = `${(current / max) * 100}%`;
    barInner.style.background = `linear-gradient(to right, ${color} 60%, transparent)`;
    barInner.style.boxShadow = `0 0 4px ${color}`;
    barOuter.appendChild(barInner);
    frag.appendChild(barOuter);
    return frag;
  };
  d.codexStats.textContent = '';
  d.codexStats.appendChild(mkBar('HP', t.hp, 200, '#0ff'));
  d.codexStats.appendChild(mkBar('SPEED', t.speed, 260, '#0af'));
  d.codexStats.appendChild(mkBar('DAMAGE', t.damage, 18, '#f0f'));
  d.codexStats.appendChild(mkBar('RANGE', t.range, 600, '#a0f'));
  d.codexStats.appendChild(mkBar('MASS', t.mass, 30, '#48f'));
  const atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = `: ${t.attackDesc}`;
  d.codexStats.appendChild(atkDiv);
  const teamDiv = document.createElement('div');
  teamDiv.style.marginTop = '4px';
  teamDiv.style.fontSize = '9px';
  teamDiv.style.color = '#666';
  teamDiv.appendChild(document.createTextNode('Team colors: '));
  const spanA = document.createElement('span');
  spanA.style.color = col;
  spanA.textContent = 'A';
  teamDiv.appendChild(spanA);
  teamDiv.appendChild(document.createTextNode(' vs '));
  const spanB = document.createElement('span');
  spanB.style.color = col2;
  spanB.textContent = 'B';
  teamDiv.appendChild(spanB);
  d.codexStats.appendChild(teamDiv);
}

function buildCodexUI() {
  const list = els().codexList;
  list.textContent = '';
  for (let i = 0; i < TYPES.length; i++) {
    const t = TYPES[i];
    if (!t) {
      continue;
    }
    const entry = document.createElement('div');
    entry.className = `cxItem${i === state.codexSelected ? ' active' : ''}`;
    const c = color(i, 0);
    const rgb = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    const hue = 180 + (i / Math.max(TYPES.length - 1, 1)) * 120;
    const dotColor = `hsl(${hue}, 100%, 60%)`;
    const dot = document.createElement('div');
    dot.className = 'ciDot';
    dot.style.background = dotColor;
    dot.style.boxShadow = `0 0 6px ${dotColor}`;
    entry.appendChild(dot);
    const labelGroup = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.className = 'ciName';
    nameDiv.style.color = rgb;
    nameDiv.textContent = t.name;
    labelGroup.appendChild(nameDiv);
    const typeDiv = document.createElement('div');
    typeDiv.className = 'ciType';
    typeDiv.textContent = t.attackDesc;
    labelGroup.appendChild(typeDiv);
    entry.appendChild(labelGroup);
    const idx = i;
    entry.onclick = () => {
      state.codexSelected = idx;
      buildCodexUI();
      setupCodexDemo(idx);
      updateCodexPanel();
    };
    list.appendChild(entry);
  }
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
    els().codex.classList.add('open');
    buildCodexUI();
    updateCodexPanel();
    setupCodexDemo(state.codexSelected);
    snapCamera();
  }
}

export function initCodexDOM() {
  _els = {
    codex: getElement(DOM_ID_CODEX),
    codexName: getElement(DOM_ID_CODEX_NAME),
    codexDesc: getElement(DOM_ID_CODEX_DESC),
    codexStats: getElement(DOM_ID_CODEX_STATS),
    codexList: getElement(DOM_ID_CODEX_LIST),
  };
}
