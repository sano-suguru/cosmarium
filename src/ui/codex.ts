import { getColor } from '../colors.ts';
import { POOL_PARTICLES, POOL_PROJECTILES, POOL_UNITS } from '../constants.ts';
import { getParticle, getProjectile, getUnit, poolCounts } from '../pools.ts';
import { killParticle, killProjectile, killUnit, spawnUnit } from '../simulation/spawn.ts';
import { beams, state, trackingBeams } from '../state.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType, TYPES } from '../unit-types.ts';
import {
  DOM_ID_CODEX,
  DOM_ID_CODEX_DESC,
  DOM_ID_CODEX_LIST,
  DOM_ID_CODEX_NAME,
  DOM_ID_CODEX_STATS,
} from './dom-ids.ts';

type DemoFlag = keyof UnitType &
  ('swarm' | 'burst' | 'heals' | 'reflects' | 'spawns' | 'emp' | 'chain' | 'teleports' | 'rams' | 'sweep' | 'beam');

const codexDemoTable: [DemoFlag, (mi: UnitIndex) => void][] = [
  ['swarm', (mi) => demoDroneSwarm(mi)],
  ['burst', (mi) => demoBurstFighter(mi)],
  ['heals', () => demoHealer()],
  ['reflects', (mi) => demoReflector(mi)],
  ['spawns', () => demoCarrier()],
  ['emp', () => demoDisruptor()],
  ['chain', () => demoArcer()],
  ['teleports', () => demoTeleporter()],
  ['rams', (mi) => demoLancer(mi)],
  ['sweep', (mi) => demoSweepBeam(mi)],
  ['beam', () => demoFocusBeam()],
];

let elCodex: HTMLElement | null = null;
let elCodexName: HTMLElement | null = null;
let elCodexDesc: HTMLElement | null = null;
let elCodexStats: HTMLElement | null = null;
let elCodexList: HTMLElement | null = null;

let codexDemoTimer = 0;
let gameUnitSnapshot: Set<UnitIndex> = new Set();

export function isCodexDemoUnit(idx: UnitIndex): boolean {
  if (!state.codexOpen) return false;
  return !gameUnitSnapshot.has(idx);
}

function teardownCodexDemo() {
  for (let i = 0; i < POOL_UNITS; i++) {
    if (getUnit(i).alive && !gameUnitSnapshot.has(i as UnitIndex)) {
      killUnit(i as UnitIndex);
    }
  }
  codexDemoTimer = 0;
  gameUnitSnapshot = new Set();
}

function closeCodex() {
  if (!state.codexOpen) return;
  teardownCodexDemo();
  state.codexOpen = false;
  if (elCodex) elCodex.classList.remove('open');
}

function demoDroneSwarm(mi: UnitIndex) {
  for (let i = 0; i < 5; i++) {
    const a = ((i + 1) / 6) * Math.PI * 2;
    spawnUnit(0, 0, Math.cos(a) * 40, Math.sin(a) * 40);
  }
  // 決定性に影響しないため Math.random() を許容
  for (let i = 0; i < 6; i++) {
    const ei = spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
    if (ei !== NO_UNIT) {
      getUnit(ei).target = mi;
    }
  }
}

function demoBurstFighter(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, 1, 200 + (Math.random() - 0.5) * 60, (i - 1) * 60);
    if (ei !== NO_UNIT) {
      getUnit(ei).target = mi;
    }
  }
}

function demoHealer() {
  const ai = spawnUnit(0, 1, -60, 0);
  if (ai !== NO_UNIT) {
    getUnit(ai).hp = 3;
  }
  const ai2 = spawnUnit(0, 0, 60, -40);
  if (ai2 !== NO_UNIT) {
    getUnit(ai2).hp = 1;
  }
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
  }
}

function demoReflector(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const a = ((i + 1) / 4) * Math.PI * 2;
    spawnUnit(0, 0, Math.cos(a) * 50, Math.sin(a) * 50);
  }
  for (let i = 0; i < 5; i++) {
    const ei = spawnUnit(1, 1, 80 + Math.random() * 40, (i - 2) * 40);
    if (ei !== NO_UNIT) {
      getUnit(ei).target = mi;
    }
  }
}

function demoCarrier() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 150);
  }
}

function demoDisruptor() {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * 6.283,
      r = 80 + Math.random() * 60;
    spawnUnit(1, 0, Math.cos(a) * r, Math.sin(a) * r);
  }
}

function demoArcer() {
  for (let i = 0; i < 6; i++) {
    spawnUnit(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10));
  }
}

function demoTeleporter() {
  for (let i = 0; i < 4; i++) {
    spawnUnit(1, 1, 250 + (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150);
  }
}

function demoLancer(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    spawnUnit(1, 3, 250, (i - 1) * 80);
  }
  if (mi !== NO_UNIT) getUnit(mi).x = -200;
}

function demoSweepBeam(mi: UnitIndex) {
  if (mi !== NO_UNIT) getUnit(mi).cooldown = 0;
  for (let i = 0; i < 6; i++) {
    const angle = ((i - 2.5) / 5) * 1.2;
    spawnUnit(1, 0, 200 + Math.cos(angle) * 40, Math.sin(angle) * 120);
  }
}

function demoFocusBeam() {
  const ti = spawnUnit(1, 1, 200, 0);
  if (ti !== NO_UNIT) getUnit(ti).hp = getUnit(ti).maxHp;
  for (let i = 0; i < 2; i++) {
    spawnUnit(1, 0, 250, (i === 0 ? -1 : 1) * 100);
  }
}

function demoDefault(t: UnitType) {
  let cnt: number;
  if (t.shape === 3) cnt = 6;
  else if (t.shape === 8) cnt = 2;
  else cnt = 4;
  for (let i = 0; i < cnt; i++) {
    spawnUnit(1, 0, 200 + Math.random() * 100, (Math.random() - 0.5) * 200);
  }
}

function clearDemoEffects() {
  for (let i = 0; i < POOL_PARTICLES; i++) {
    if (getParticle(i).alive) {
      killParticle(i as ParticleIndex);
    }
  }
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    if (getProjectile(i).alive) {
      killProjectile(i as ProjectileIndex);
    }
  }
  beams.length = 0;
  trackingBeams.length = 0;
}

function countDemoEnemies(): number {
  let ec = 0;
  for (let i = 0, rem = poolCounts.unitCount; i < POOL_UNITS && rem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    rem--;
    if (!gameUnitSnapshot.has(i as UnitIndex) && u.team === 1) ec++;
  }
  return ec;
}

function setupCodexDemo(typeIdx: number) {
  teardownCodexDemo();

  gameUnitSnapshot = new Set();
  for (let i = 0; i < POOL_UNITS; i++) {
    if (getUnit(i).alive) gameUnitSnapshot.add(i as UnitIndex);
  }

  clearDemoEffects();

  const t = getUnitType(typeIdx);
  const mi = spawnUnit(0, typeIdx, 0, 0);
  if (mi !== NO_UNIT) {
    getUnit(mi).angle = 0;
  }

  let matched = false;
  for (const [flag, fn] of codexDemoTable) {
    if (t[flag]) {
      fn(mi);
      matched = true;
      break;
    }
  }
  if (!matched) demoDefault(t);
}

export function updateCodexDemo(dt: number) {
  codexDemoTimer += dt;
  if (codexDemoTimer > 3) {
    codexDemoTimer = 0;
    const ec = countDemoEnemies();
    if (ec < 2) setupCodexDemo(state.codexSelected);
  }
  for (let i = 0, rem = poolCounts.unitCount; i < POOL_UNITS && rem > 0; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    rem--;
    if (gameUnitSnapshot.has(i as UnitIndex)) continue;
    if (u.team === 0 && !getUnitType(u.type).rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    // 両チームをヒール: 展示ユニット(team 0)が倒されるのを防ぎ、敵(team 1)はサンドバッグとして維持する
    u.hp = Math.min(u.maxHp, u.hp + dt * 2);
  }
}

function updateCodexPanel() {
  if (!elCodexName || !elCodexDesc || !elCodexStats) return;
  const t = getUnitType(state.codexSelected);
  const c0 = getColor(state.codexSelected, 0),
    c1 = getColor(state.codexSelected, 1);
  const col = `rgb(${(c0[0] * 255) | 0},${(c0[1] * 255) | 0},${(c0[2] * 255) | 0})`;
  const col2 = `rgb(${(c1[0] * 255) | 0},${(c1[1] * 255) | 0},${(c1[2] * 255) | 0})`;
  elCodexName.textContent = t.name;
  elCodexName.style.color = col;
  elCodexDesc.textContent = t.description;

  const mkBar = (label: string, val: number, max: number, color: string): DocumentFragment => {
    const frag = document.createDocumentFragment();
    const lbl = document.createElement('div');
    lbl.textContent = `${label}: ${val}`;
    frag.appendChild(lbl);
    const barOuter = document.createElement('div');
    barOuter.className = 'cpBar';
    const barInner = document.createElement('div');
    barInner.style.width = `${(val / max) * 100}%`;
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
    const item = document.createElement('div');
    item.className = `cxItem${i === state.codexSelected ? ' active' : ''}`;
    const c = getColor(i, 0);
    const rgb = `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    const dot = document.createElement('div');
    dot.className = 'ciDot';
    dot.style.background = rgb;
    dot.style.boxShadow = `0 0 6px ${rgb}`;
    item.appendChild(dot);
    const info = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.className = 'ciName';
    nameDiv.style.color = rgb;
    nameDiv.textContent = t.name;
    info.appendChild(nameDiv);
    const typeDiv = document.createElement('div');
    typeDiv.className = 'ciType';
    typeDiv.textContent = t.attackDesc;
    info.appendChild(typeDiv);
    item.appendChild(info);
    item.onclick = ((idx: number) => () => {
      state.codexSelected = idx;
      buildCodexUI();
      setupCodexDemo(idx);
      updateCodexPanel();
    })(i);
    list.appendChild(item);
  });
}

export function toggleCodex() {
  if (state.codexOpen) {
    closeCodex();
  } else {
    state.codexOpen = true;
    if (elCodex) elCodex.classList.add('open');
    buildCodexUI();
    updateCodexPanel();
    setupCodexDemo(state.codexSelected);
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
