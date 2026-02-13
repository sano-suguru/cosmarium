import { getColor } from '../colors.ts';
import { POOL_PARTICLES, POOL_PROJECTILES } from '../constants.ts';
import { particlePool, projectilePool, unitPool } from '../pools.ts';
import { killParticle, killProjectile, killUnit, spawnUnit } from '../simulation/spawn.ts';
import { beams, state } from '../state.ts';
import type { ParticleIndex, ProjectileIndex, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';
import { TYPES } from '../unit-types.ts';
import { DOM_ID_CAT_DESC, DOM_ID_CAT_LIST, DOM_ID_CAT_NAME, DOM_ID_CAT_STATS, DOM_ID_CATALOG } from './dom-ids.ts';

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
  document.getElementById(DOM_ID_CATALOG)!.classList.remove('open');
}

function setupCatDemo(typeIdx: number) {
  teardownCatDemo();

  for (let i = 0; i < POOL_PARTICLES; i++) {
    if (particlePool[i]!.alive) {
      killParticle(i as ParticleIndex);
    }
  }
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    if (projectilePool[i]!.alive) {
      killProjectile(i as ProjectileIndex);
    }
  }
  beams.length = 0;

  const t = TYPES[typeIdx]!;
  const mi = spawnUnit(0, typeIdx, 0, 0);
  if (mi !== NO_UNIT) {
    catDemoUnits.push(mi);
    unitPool[mi]!.angle = 0;
  }

  if (t.heals) {
    const ai = spawnUnit(0, 1, -60, 0);
    if (ai !== NO_UNIT) {
      catDemoUnits.push(ai);
      unitPool[ai]!.hp = 3;
    }
    const ai2 = spawnUnit(0, 0, 60, -40);
    if (ai2 !== NO_UNIT) {
      catDemoUnits.push(ai2);
      unitPool[ai2]!.hp = 1;
    }
    for (let i = 0; i < 3; i++) {
      const ei = spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  } else if (t.reflects) {
    for (let i = 0; i < 5; i++) {
      const ei = spawnUnit(1, 1, 180 + Math.random() * 60, (i - 2) * 50);
      if (ei !== NO_UNIT) {
        catDemoUnits.push(ei);
        unitPool[ei]!.target = mi;
      }
    }
  } else if (t.spawns) {
    for (let i = 0; i < 4; i++) {
      const ei = spawnUnit(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 150);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  } else if (t.emp) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283,
        r = 80 + Math.random() * 60;
      const ei = spawnUnit(1, 0, Math.cos(a) * r, Math.sin(a) * r);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  } else if (t.chain) {
    for (let i = 0; i < 6; i++) {
      const ei = spawnUnit(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10));
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  } else if (t.teleports) {
    for (let i = 0; i < 4; i++) {
      const ei = spawnUnit(1, 1, 250 + (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  } else if (t.rams) {
    for (let i = 0; i < 3; i++) {
      const ei = spawnUnit(1, 3, 250, (i - 1) * 80);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
    if (mi !== NO_UNIT) unitPool[mi]!.x = -200;
  } else {
    let cnt: number;
    if (t.shape === 3) cnt = 6;
    else if (t.shape === 8) cnt = 2;
    else cnt = 4;
    for (let i = 0; i < cnt; i++) {
      const ei = spawnUnit(1, 0, 200 + Math.random() * 100, (Math.random() - 0.5) * 200);
      if (ei !== NO_UNIT) catDemoUnits.push(ei);
    }
  }
}

export function updateCatDemo(dt: number) {
  catDemoTimer += dt;
  if (catDemoTimer > 3) {
    catDemoTimer = 0;
    let ec = 0;
    for (const idx of catDemoUnits) {
      const unit = unitPool[idx]!;
      if (unit.alive && unit.team === 1) ec++;
    }
    if (ec < 2) setupCatDemo(state.catSelected);
  }
  for (const idx of catDemoUnits) {
    const u = unitPool[idx]!;
    if (!u.alive) continue;
    if (u.team === 0 && !TYPES[u.type]!.rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    if (u.team === 1) u.hp = Math.min(u.maxHp, u.hp + dt * 2);
  }
}

function updateCatPanel() {
  const t = TYPES[state.catSelected]!;
  const c0 = getColor(state.catSelected, 0),
    c1 = getColor(state.catSelected, 1);
  const col = 'rgb(' + ((c0[0] * 255) | 0) + ',' + ((c0[1] * 255) | 0) + ',' + ((c0[2] * 255) | 0) + ')';
  const col2 = 'rgb(' + ((c1[0] * 255) | 0) + ',' + ((c1[1] * 255) | 0) + ',' + ((c1[2] * 255) | 0) + ')';
  document.getElementById(DOM_ID_CAT_NAME)!.textContent = t.name;
  document.getElementById(DOM_ID_CAT_NAME)!.style.color = col;
  document.getElementById(DOM_ID_CAT_DESC)!.textContent = t.description;

  const mkBar = (label: string, val: number, max: number, color: string): DocumentFragment => {
    const frag = document.createDocumentFragment();
    const lbl = document.createElement('div');
    lbl.textContent = label + ': ' + val;
    frag.appendChild(lbl);
    const barOuter = document.createElement('div');
    barOuter.className = 'cpBar';
    const barInner = document.createElement('div');
    barInner.style.width = (val / max) * 100 + '%';
    barInner.style.background = color;
    barOuter.appendChild(barInner);
    frag.appendChild(barOuter);
    return frag;
  };
  const stats = document.getElementById(DOM_ID_CAT_STATS)!;
  stats.textContent = '';
  stats.appendChild(mkBar('HP', t.hp, 200, '#4f4'));
  stats.appendChild(mkBar('SPEED', t.speed, 260, '#4cf'));
  stats.appendChild(mkBar('DAMAGE', t.damage, 18, '#f64'));
  stats.appendChild(mkBar('RANGE', t.range, 600, '#fc4'));
  stats.appendChild(mkBar('MASS', t.mass, 30, '#c8f'));
  const atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = ': ' + t.attackDesc;
  stats.appendChild(atkDiv);
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
  stats.appendChild(teamDiv);
}

function buildCatUI() {
  const list = document.getElementById(DOM_ID_CAT_LIST)!;
  list.textContent = '';
  TYPES.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'catItem' + (i === state.catSelected ? ' active' : '');
    const c = getColor(i, 0);
    const rgb = 'rgb(' + ((c[0] * 255) | 0) + ',' + ((c[1] * 255) | 0) + ',' + ((c[2] * 255) | 0) + ')';
    const dot = document.createElement('div');
    dot.className = 'ciDot';
    dot.style.background = rgb;
    dot.style.boxShadow = '0 0 6px ' + rgb;
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
    document.getElementById(DOM_ID_CATALOG)!.classList.add('open');
    buildCatUI();
    updateCatPanel();
    setupCatDemo(state.catSelected);
  }
}
