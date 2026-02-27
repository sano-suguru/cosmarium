import { beams, trackingBeams } from '../beams.ts';
import { color } from '../colors.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import type { CameraSnapshot } from '../input/camera.ts';
import { restoreCamera, snapCamera, snapshotCamera, updateDemoCamera } from '../input/camera.ts';
import { clearAllPools, particle, poolCounts, projectile, setPoolCounts, unit } from '../pools.ts';
import { demoFlag } from '../simulation/combat.ts';
import { resetChains, restoreChains, snapshotChains } from '../simulation/effects.ts';
import { spawnUnit } from '../simulation/spawn.ts';
import { state } from '../state.ts';
import type { Beam, DemoFlag, Particle, Projectile, TrackingBeam, Unit, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { TYPES, unitType, unitTypeIndex } from '../unit-types.ts';
import {
  DOM_ID_CODEX,
  DOM_ID_CODEX_DESC,
  DOM_ID_CODEX_LIST,
  DOM_ID_CODEX_NAME,
  DOM_ID_CODEX_STATS,
} from './dom-ids.ts';

import { clearKillFeed } from './kill-feed.ts';

const SCORCHER_TYPE = unitTypeIndex('Scorcher');
const CRUISER_TYPE = unitTypeIndex('Cruiser');

/** Codexデモは決定性に影響しないためMath.randomを使用 */
export const demoRng: () => number = Math.random;

const demoByFlag: Record<DemoFlag, (mi: UnitIndex) => void> = {
  swarm: (mi) => demoDroneSwarm(mi),
  carpet: (mi) => demoCarpetBomber(mi),
  homing: (mi) => demoHomingLauncher(mi),
  burst: (mi) => demoBurstFighter(mi),
  heals: () => demoHealer(),
  reflects: (mi) => demoReflector(mi),
  spawns: () => demoCarrier(),
  emp: () => demoDisruptor(),
  chain: () => demoArcer(),
  teleports: () => demoTeleporter(),
  rams: (mi) => demoLancer(mi),
  sweep: (mi) => demoSweepBeam(mi),
  beam: () => demoFocusBeam(),
  broadside: (mi) => demoFlagship(mi),
  shields: () => demoBastion(),
  amplifies: () => demoAmplifier(),
  scrambles: () => demoScrambler(),
  catalyzes: () => demoCatalyst(),
};

let elCodex: HTMLElement | null = null;
let elCodexName: HTMLElement | null = null;
let elCodexDesc: HTMLElement | null = null;
let elCodexStats: HTMLElement | null = null;
let elCodexList: HTMLElement | null = null;

let codexDemoTimer = 0;
let cameraSnapshotBeforeCodex: CameraSnapshot | null = null;

interface PoolSnapshot {
  units: Array<{ index: number; copy: Unit }>;
  particles: Array<{ index: number; copy: Particle }>;
  projectiles: Array<{ index: number; copy: Projectile }>;
  beams: Beam[];
  trackingBeams: TrackingBeam[];
  pendingChains: ReturnType<typeof snapshotChains>;
  counts: { units: number; particles: number; projectiles: number };
}

let poolSnapshot: PoolSnapshot | null = null;

/** 全プール状態のスナップショット。全フィールドはプリミティブ型（検証済み）のため shallow copy で安全。新フィールド追加時は参照型でないことを確認すること */
export function snapshotPools(): PoolSnapshot {
  const units: PoolSnapshot['units'] = [];
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unit(i);
    if (u.alive) units.push({ index: i, copy: { ...u } });
  }
  const particles: PoolSnapshot['particles'] = [];
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = particle(i);
    if (p.alive) particles.push({ index: i, copy: { ...p } });
  }
  const projectiles: PoolSnapshot['projectiles'] = [];
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const p = projectile(i);
    if (p.alive) projectiles.push({ index: i, copy: { ...p } });
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
    },
  };
}

export function restorePools(snapshot: PoolSnapshot) {
  clearAllPools();
  restoreChains(snapshot.pendingChains);
  for (const entry of snapshot.units) Object.assign(unit(entry.index), entry.copy);
  for (const entry of snapshot.particles) Object.assign(particle(entry.index), entry.copy);
  for (const entry of snapshot.projectiles) Object.assign(projectile(entry.index), entry.copy);
  for (const b of snapshot.beams) beams.push(b);
  for (const tb of snapshot.trackingBeams) trackingBeams.push(tb);
  setPoolCounts(snapshot.counts.units, snapshot.counts.particles, snapshot.counts.projectiles);
}

function clearCurrentDemo() {
  clearAllPools();
  resetChains();
  codexDemoTimer = 0;
}

function closeCodex() {
  if (!state.codexOpen) return;
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
  if (elCodex) elCodex.classList.remove('open');
}

function demoDroneSwarm(mi: UnitIndex) {
  for (let i = 0; i < 5; i++) {
    const a = ((i + 1) / 6) * Math.PI * 2;
    spawnUnit(0, 0, Math.cos(a) * 40, Math.sin(a) * 40, demoRng);
  }
  for (let i = 0; i < 6; i++) {
    const ei = spawnUnit(1, 0, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 120, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoBurstFighter(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, 1, 200 + (demoRng() - 0.5) * 60, (i - 1) * 60, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoHealer() {
  const ai = spawnUnit(0, 1, -60, 0, demoRng);
  if (ai !== NO_UNIT) {
    unit(ai).hp = 3;
  }
  const ai2 = spawnUnit(0, 0, 60, -40, demoRng);
  if (ai2 !== NO_UNIT) {
    unit(ai2).hp = 1;
  }
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, 0, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 120, demoRng);
  }
}

function demoReflector(mi: UnitIndex) {
  for (let i = 0; i < 2; i++) {
    spawnUnit(0, 1, -40, (i === 0 ? -1 : 1) * 30, demoRng);
  }
  const fi = spawnUnit(1, 1, -120, 0, demoRng);
  if (fi !== NO_UNIT) unit(fi).target = mi;
  const bi1 = spawnUnit(1, SCORCHER_TYPE, 200 + demoRng() * 40, 60, demoRng);
  if (bi1 !== NO_UNIT) unit(bi1).target = mi;
  const bi2 = spawnUnit(1, CRUISER_TYPE, 200 + demoRng() * 40, 100, demoRng);
  if (bi2 !== NO_UNIT) unit(bi2).target = mi;
}

function demoCarrier() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, 0, 200 + (demoRng() - 0.5) * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoDisruptor() {
  for (let i = 0; i < 8; i++) {
    const a = demoRng() * 6.283,
      r = 80 + demoRng() * 60;
    spawnUnit(1, 0, Math.cos(a) * r, Math.sin(a) * r, demoRng);
  }
}

function demoArcer() {
  for (let i = 0; i < 6; i++) {
    spawnUnit(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10), demoRng);
  }
}

function demoTeleporter() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, 1, 250 + (demoRng() - 0.5) * 100, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoLancer(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, 3, 250, (i - 1) * 80, demoRng);
  }
  if (mi !== NO_UNIT) unit(mi).x = -200;
}

function demoSweepBeam(mi: UnitIndex) {
  if (mi !== NO_UNIT) unit(mi).cooldown = 0;
  for (let i = 0; i < 6; i++) {
    const angle = ((i - 2.5) / 5) * 1.2;
    spawnUnit(1, 0, 200 + Math.cos(angle) * 40, Math.sin(angle) * 120, demoRng);
  }
}

function demoFocusBeam() {
  const ti = spawnUnit(1, 1, 200, 0, demoRng);
  if (ti !== NO_UNIT) unit(ti).hp = unit(ti).maxHp;
  for (let i = 0; i < 2; i++) {
    spawnUnit(1, 0, 250, (i === 0 ? -1 : 1) * 100, demoRng);
  }
}

function demoFlagship(mi: UnitIndex) {
  if (mi !== NO_UNIT) unit(mi).cooldown = 0;
  for (let i = 0; i < 6; i++) {
    spawnUnit(1, 0, 250 + demoRng() * 80, (demoRng() - 0.5) * 200, demoRng);
  }
}

function demoCarpetBomber(mi: UnitIndex) {
  for (let i = 0; i < 8; i++) {
    const a = demoRng() * 6.283;
    const r = 120 + demoRng() * 40;
    const ei = spawnUnit(1, 0, Math.cos(a) * r, Math.sin(a) * r, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoHomingLauncher(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, 1, 250 + (demoRng() - 0.5) * 100, (i - 1) * 60, demoRng);
    if (ei !== NO_UNIT) {
      unit(ei).target = mi;
    }
  }
}

function demoBastion() {
  for (let i = 0; i < 3; i++) {
    const a = ((i + 1) / 4) * Math.PI * 2;
    const ai = spawnUnit(0, 1, Math.cos(a) * 70, Math.sin(a) * 70, demoRng);
    if (ai !== NO_UNIT) unit(ai).hp = 5;
  }
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, 0, 200 + demoRng() * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoAmplifier() {
  const FIGHTER_TYPE = unitTypeIndex('Fighter');
  const DRONE_TYPE = unitTypeIndex('Drone');
  const fi1 = spawnUnit(0, FIGHTER_TYPE, -60, -40, demoRng);
  if (fi1 !== NO_UNIT) unit(fi1).hp = 5;
  const fi2 = spawnUnit(0, FIGHTER_TYPE, -60, 40, demoRng);
  if (fi2 !== NO_UNIT) unit(fi2).hp = 7;
  spawnUnit(0, DRONE_TYPE, -40, 0, demoRng);
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, 0, 200 + demoRng() * 80, (demoRng() - 0.5) * 150, demoRng);
  }
}

function demoScrambler() {
  const FIGHTER_TYPE = unitTypeIndex('Fighter');
  const DRONE_TYPE = unitTypeIndex('Drone');
  // 味方Fighter 2体（対比用、射撃が鈍らない）
  spawnUnit(0, FIGHTER_TYPE, -80, -50, demoRng);
  spawnUnit(0, FIGHTER_TYPE, -80, 50, demoRng);
  // 敵Drone 4体 + Fighter 2体（Scrambler範囲内、射撃が鈍る）
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, DRONE_TYPE, 50 + demoRng() * 40, (demoRng() - 0.5) * 100, demoRng);
  }
  spawnUnit(1, FIGHTER_TYPE, 70, -40, demoRng);
  spawnUnit(1, FIGHTER_TYPE, 70, 40, demoRng);
}

function demoCatalyst() {
  const DRONE_TYPE = unitTypeIndex('Drone');
  const FIGHTER_TYPE = unitTypeIndex('Fighter');
  // 味方Drone 4体 + Fighter 1体（加速される対象）
  spawnUnit(0, DRONE_TYPE, -50, -60, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, -20, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, 20, demoRng);
  spawnUnit(0, DRONE_TYPE, -50, 60, demoRng);
  spawnUnit(0, FIGHTER_TYPE, -70, 0, demoRng);
  // 敵Drone 3体（遠方、対比用）
  spawnUnit(1, DRONE_TYPE, 200, -40, demoRng);
  spawnUnit(1, DRONE_TYPE, 200, 0, demoRng);
  spawnUnit(1, DRONE_TYPE, 200, 40, demoRng);
}

function demoDefault(t: UnitType) {
  let cnt: number;
  if (t.shape === 8) cnt = 2;
  else cnt = 4;
  for (let i = 0; i < cnt; i++) {
    spawnUnit(1, 0, 200 + demoRng() * 100, (demoRng() - 0.5) * 200, demoRng);
  }
}

function countDemoEnemies(): number {
  let ec = 0;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (u.team === 1) ec++;
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
  if (!matched) demoDefault(t);

  const bounds = computeDemoBounds();
  updateDemoCamera(bounds);
}

export function computeDemoBounds(): { cx: number; cy: number; radius: number } {
  let count = 0;
  let sx = 0;
  let sy = 0;

  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
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
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const dx = u.x - cx;
    const dy = u.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) maxDist = dist;
  }

  const radius = Math.max(80, maxDist + 50);
  return { cx, cy, radius };
}

export function updateCodexDemo(dt: number) {
  codexDemoTimer += dt;
  if (codexDemoTimer > 3) {
    codexDemoTimer = 0;
    const ec = countDemoEnemies();
    if (ec < 2) setupCodexDemo(state.codexSelected);
  }
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
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
  if (!elCodexName || !elCodexDesc || !elCodexStats) return;
  const t = unitType(state.codexSelected);
  const c0 = color(state.codexSelected, 0),
    c1 = color(state.codexSelected, 1);
  const col = `rgb(${(c0[0] * 255) | 0},${(c0[1] * 255) | 0},${(c0[2] * 255) | 0})`;
  const col2 = `rgb(${(c1[0] * 255) | 0},${(c1[1] * 255) | 0},${(c1[2] * 255) | 0})`;
  elCodexName.textContent = t.name;
  elCodexName.style.color = col;
  elCodexDesc.textContent = t.description;

  const mkBar = (label: string, current: number, max: number, color: string): DocumentFragment => {
    const frag = document.createDocumentFragment();
    const lbl = document.createElement('div');
    lbl.textContent = `${label}: ${current}`;
    frag.appendChild(lbl);
    const barOuter = document.createElement('div');
    barOuter.className = 'cpBar';
    const barInner = document.createElement('div');
    barInner.style.width = `${(current / max) * 100}%`;
    barInner.style.background = color;
    barOuter.appendChild(barInner);
    frag.appendChild(barOuter);
    return frag;
  };
  elCodexStats.textContent = '';
  elCodexStats.appendChild(mkBar('HP', t.hp, 200, '#4f4'));
  elCodexStats.appendChild(mkBar('SPEED', t.speed, 260, '#4cf'));
  elCodexStats.appendChild(mkBar('DAMAGE', t.damage, 18, '#f64'));
  elCodexStats.appendChild(mkBar('RANGE', t.range, 600, '#fc4'));
  elCodexStats.appendChild(mkBar('MASS', t.mass, 30, '#c8f'));
  const atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = `: ${t.attackDesc}`;
  elCodexStats.appendChild(atkDiv);
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
  elCodexStats.appendChild(teamDiv);
}

function buildCodexUI() {
  if (!elCodexList) return;
  const list = elCodexList;
  list.textContent = '';
  TYPES.forEach((t, i) => {
    const entry = document.createElement('div');
    entry.className = `cxItem${i === state.codexSelected ? ' active' : ''}`;
    const c = color(i, 0);
    const rgb = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    const dot = document.createElement('div');
    dot.className = 'ciDot';
    dot.style.background = rgb;
    dot.style.boxShadow = `0 0 6px ${rgb}`;
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
    entry.onclick = ((idx: number) => () => {
      state.codexSelected = idx;
      buildCodexUI();
      setupCodexDemo(idx);
      updateCodexPanel();
    })(i);
    list.appendChild(entry);
  });
}

export function toggleCodex() {
  if (state.codexOpen) {
    closeCodex();
    clearKillFeed();
  } else {
    clearKillFeed();
    cameraSnapshotBeforeCodex = snapshotCamera();
    poolSnapshot = snapshotPools();
    // setupCodexDemo() → clearCurrentDemo() が初回クリアを担当
    state.codexOpen = true;
    if (elCodex) elCodex.classList.add('open');
    buildCodexUI();
    updateCodexPanel();
    setupCodexDemo(state.codexSelected);
    snapCamera();
  }
}

export function initCodexDOM() {
  elCodex = document.getElementById(DOM_ID_CODEX);
  elCodexName = document.getElementById(DOM_ID_CODEX_NAME);
  elCodexDesc = document.getElementById(DOM_ID_CODEX_DESC);
  elCodexStats = document.getElementById(DOM_ID_CODEX_STATS);
  elCodexList = document.getElementById(DOM_ID_CODEX_LIST);

  {
    const entries: [string, HTMLElement | null][] = [
      [DOM_ID_CODEX, elCodex],
      [DOM_ID_CODEX_NAME, elCodexName],
      [DOM_ID_CODEX_DESC, elCodexDesc],
      [DOM_ID_CODEX_STATS, elCodexStats],
      [DOM_ID_CODEX_LIST, elCodexList],
    ];
    const missing = entries.filter(([, el]) => !el).map(([id]) => id);
    if (missing.length > 0) {
      throw new Error(`initCodexDOM: missing DOM elements: ${missing.join(', ')}`);
    }
  }
}
