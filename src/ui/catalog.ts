import { getColor } from '../colors.ts';
import { POOL_PARTICLES, POOL_PROJECTILES } from '../constants.ts';
import { getParticle, getProjectile, getUnit } from '../pools.ts';
import { killParticle, killProjectile, killUnit, spawnUnit } from '../simulation/spawn.ts';
import { beams, state } from '../state.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex, UnitType } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { getUnitType, TYPES } from '../unit-types.ts';
import { DOM_ID_CAT_DESC, DOM_ID_CAT_LIST, DOM_ID_CAT_NAME, DOM_ID_CAT_STATS, DOM_ID_CATALOG } from './dom-ids.ts';

// DOM element cache (populated by initCatalogDOM)
let elCatalog: HTMLElement | null = null;
let elCatName: HTMLElement | null = null;
let elCatDesc: HTMLElement | null = null;
let elCatStats: HTMLElement | null = null;
let elCatList: HTMLElement | null = null;

let catDemoUnits: UnitIndex[] = [];
let catDemoTimer = 0;

function teardownCatDemo() {
  for (const idx of catDemoUnits) {
    killUnit(idx);
  }
  catDemoUnits = [];
  catDemoTimer = 0;
}

export function closeCatalog() {
  if (!state.catalogOpen) return;
  teardownCatDemo();
  state.catalogOpen = false;
  if (elCatalog) elCatalog.classList.remove('open');
}

function demoHealer() {
  const ai = spawnUnit(0, 1, -60, 0);
  if (ai !== NO_UNIT) {
    catDemoUnits.push(ai);
    getUnit(ai).hp = 3;
  }
  const ai2 = spawnUnit(0, 0, 60, -40);
  if (ai2 !== NO_UNIT) {
    catDemoUnits.push(ai2);
    getUnit(ai2).hp = 1;
  }
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function demoReflector(mi: UnitIndex) {
  for (let i = 0; i < 5; i++) {
    const ei = spawnUnit(1, 1, 180 + Math.random() * 60, (i - 2) * 50);
    if (ei !== NO_UNIT) {
      catDemoUnits.push(ei);
      getUnit(ei).target = mi;
    }
  }
}

function demoCarrier() {
  for (let i = 0; i < 4; i++) {
    const ei = spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 150);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function demoEmp() {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * 6.283,
      r = 80 + Math.random() * 60;
    const ei = spawnUnit(1, 0, Math.cos(a) * r, Math.sin(a) * r);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function demoChain() {
  for (let i = 0; i < 6; i++) {
    const ei = spawnUnit(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10));
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function demoTeleporter() {
  for (let i = 0; i < 4; i++) {
    const ei = spawnUnit(1, 1, 250 + (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function demoRam(mi: UnitIndex) {
  for (let i = 0; i < 3; i++) {
    const ei = spawnUnit(1, 3, 250, (i - 1) * 80);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
  if (mi !== NO_UNIT) getUnit(mi).x = -200;
}

function demoDefault(t: UnitType) {
  let cnt: number;
  if (t.shape === 3) cnt = 6;
  else if (t.shape === 8) cnt = 2;
  else cnt = 4;
  for (let i = 0; i < cnt; i++) {
    const ei = spawnUnit(1, 0, 200 + Math.random() * 100, (Math.random() - 0.5) * 200);
    if (ei !== NO_UNIT) catDemoUnits.push(ei);
  }
}

function setupCatDemo(typeIdx: number) {
  teardownCatDemo();

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

  const t = getUnitType(typeIdx);
  const mi = spawnUnit(0, typeIdx, 0, 0);
  if (mi !== NO_UNIT) {
    catDemoUnits.push(mi);
    getUnit(mi).angle = 0;
  }

  if (t.heals) demoHealer();
  else if (t.reflects) demoReflector(mi);
  else if (t.spawns) demoCarrier();
  else if (t.emp) demoEmp();
  else if (t.chain) demoChain();
  else if (t.teleports) demoTeleporter();
  else if (t.rams) demoRam(mi);
  else demoDefault(t);
}

export function updateCatDemo(dt: number) {
  catDemoTimer += dt;
  if (catDemoTimer > 3) {
    catDemoTimer = 0;
    let ec = 0;
    for (const idx of catDemoUnits) {
      const unit = getUnit(idx);
      if (unit.alive && unit.team === 1) ec++;
    }
    if (ec < 2) setupCatDemo(state.catSelected);
  }
  for (const idx of catDemoUnits) {
    const u = getUnit(idx);
    if (!u.alive) continue;
    if (u.team === 0 && !getUnitType(u.type).rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    if (u.team === 1) u.hp = Math.min(u.maxHp, u.hp + dt * 2);
  }
}

function updateCatPanel() {
  if (!elCatName || !elCatDesc || !elCatStats) return;
  const t = getUnitType(state.catSelected);
  const c0 = getColor(state.catSelected, 0),
    c1 = getColor(state.catSelected, 1);
  const col = `rgb(${(c0[0] * 255) | 0},${(c0[1] * 255) | 0},${(c0[2] * 255) | 0})`;
  const col2 = `rgb(${(c1[0] * 255) | 0},${(c1[1] * 255) | 0},${(c1[2] * 255) | 0})`;
  elCatName.textContent = t.name;
  elCatName.style.color = col;
  elCatDesc.textContent = t.description;

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
  elCatStats.textContent = '';
  elCatStats.appendChild(mkBar('HP', t.hp, 200, '#4f4'));
  elCatStats.appendChild(mkBar('SPEED', t.speed, 260, '#4cf'));
  elCatStats.appendChild(mkBar('DAMAGE', t.damage, 18, '#f64'));
  elCatStats.appendChild(mkBar('RANGE', t.range, 600, '#fc4'));
  elCatStats.appendChild(mkBar('MASS', t.mass, 30, '#c8f'));
  const atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = `: ${t.attackDesc}`;
  elCatStats.appendChild(atkDiv);
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
  elCatStats.appendChild(teamDiv);
}

function buildCatUI() {
  if (!elCatList) return;
  const list = elCatList;
  list.textContent = '';
  TYPES.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = `catItem${i === state.catSelected ? ' active' : ''}`;
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
      state.catSelected = idx;
      buildCatUI();
      setupCatDemo(idx);
      updateCatPanel();
    })(i);
    list.appendChild(item);
  });
}

export function toggleCat() {
  if (state.catalogOpen) {
    closeCatalog();
  } else {
    state.catalogOpen = true;
    if (elCatalog) elCatalog.classList.add('open');
    buildCatUI();
    updateCatPanel();
    setupCatDemo(state.catSelected);
  }
}

export function initCatalogDOM() {
  elCatalog = document.getElementById(DOM_ID_CATALOG);
  elCatName = document.getElementById(DOM_ID_CAT_NAME);
  elCatDesc = document.getElementById(DOM_ID_CAT_DESC);
  elCatStats = document.getElementById(DOM_ID_CAT_STATS);
  elCatList = document.getElementById(DOM_ID_CAT_LIST);

  {
    const entries: [string, HTMLElement | null][] = [
      [DOM_ID_CATALOG, elCatalog],
      [DOM_ID_CAT_NAME, elCatName],
      [DOM_ID_CAT_DESC, elCatDesc],
      [DOM_ID_CAT_STATS, elCatStats],
      [DOM_ID_CAT_LIST, elCatList],
    ];
    const missing = entries.filter(([, el]) => !el).map(([id]) => id);
    if (missing.length > 0) {
      throw new Error(`initCatalogDOM: missing DOM elements: ${missing.join(', ')}`);
    }
  }
}
