import { gC } from '../colors.ts';
import { POOL_PARTICLES, POOL_PROJECTILES } from '../constants.ts';
import { poolCounts, pP, prP, uP } from '../pools.ts';
import { killU, spU } from '../simulation/spawn.ts';
import { beams, catalogOpen, catSelected, setCatalogOpen, setCatSelected } from '../state.ts';
import { TYPES } from '../unit-types.ts';

let catDemoUnits: number[] = [];
let catDemoTimer = 0;

function setupCatDemo(typeIdx: number) {
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const p = pP[i]!;
    if (p.alive) {
      p.alive = false;
      poolCounts.pC--;
    }
  }
  for (let i = 0; i < POOL_PROJECTILES; i++) {
    const pr = prP[i]!;
    if (pr.alive) {
      pr.alive = false;
      poolCounts.prC--;
    }
  }
  beams.length = 0;
  catDemoUnits.forEach((idx) => {
    if (uP[idx]!.alive) killU(idx);
  });
  catDemoUnits = [];
  catDemoTimer = 0;

  const t = TYPES[typeIdx]!;
  const mi = spU(0, typeIdx, 0, 0);
  if (mi >= 0) {
    catDemoUnits.push(mi);
    uP[mi]!.ang = 0;
  }

  if (t.heals) {
    const ai = spU(0, 1, -60, 0);
    if (ai >= 0) {
      catDemoUnits.push(ai);
      uP[ai]!.hp = 3;
    }
    const ai2 = spU(0, 0, 60, -40);
    if (ai2 >= 0) {
      catDemoUnits.push(ai2);
      uP[ai2]!.hp = 1;
    }
    for (let i = 0; i < 3; i++) {
      const ei = spU(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.reflects) {
    for (let i = 0; i < 5; i++) {
      const ei = spU(1, 1, 180 + Math.random() * 60, (i - 2) * 50);
      if (ei >= 0) {
        catDemoUnits.push(ei);
        uP[ei]!.tgt = mi;
      }
    }
  } else if (t.spawns) {
    for (let i = 0; i < 4; i++) {
      const ei = spU(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 150);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.emp) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283,
        r = 80 + Math.random() * 60;
      const ei = spU(1, 0, Math.cos(a) * r, Math.sin(a) * r);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.chain) {
    for (let i = 0; i < 6; i++) {
      const ei = spU(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10));
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.teleports) {
    for (let i = 0; i < 4; i++) {
      const ei = spU(1, 1, 250 + (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.rams) {
    for (let i = 0; i < 3; i++) {
      const ei = spU(1, 3, 250, (i - 1) * 80);
      if (ei >= 0) catDemoUnits.push(ei);
    }
    if (mi >= 0) uP[mi]!.x = -200;
  } else {
    let cnt: number;
    if (t.sh === 3) cnt = 6;
    else if (t.sh === 8) cnt = 2;
    else cnt = 4;
    for (let i = 0; i < cnt; i++) {
      const ei = spU(1, 0, 200 + Math.random() * 100, (Math.random() - 0.5) * 200);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  }
}

export function updateCatDemo(dt: number) {
  catDemoTimer += dt;
  if (catDemoTimer > 3) {
    catDemoTimer = 0;
    let ec = 0;
    catDemoUnits.forEach((idx) => {
      const unit = uP[idx]!;
      if (unit.alive && unit.team === 1) ec++;
    });
    if (ec < 2) setupCatDemo(catSelected);
  }
  catDemoUnits.forEach((idx) => {
    const u = uP[idx]!;
    if (!u.alive) return;
    if (u.team === 0 && !TYPES[u.type]!.rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    if (u.team === 1) u.hp = Math.min(u.mhp, u.hp + dt * 2);
  });
}

function updateCatPanel() {
  const t = TYPES[catSelected]!;
  const c0 = gC(catSelected, 0),
    c1 = gC(catSelected, 1);
  const col = 'rgb(' + ((c0[0] * 255) | 0) + ',' + ((c0[1] * 255) | 0) + ',' + ((c0[2] * 255) | 0) + ')';
  const col2 = 'rgb(' + ((c1[0] * 255) | 0) + ',' + ((c1[1] * 255) | 0) + ',' + ((c1[2] * 255) | 0) + ')';
  document.getElementById('cpName')!.textContent = t.nm;
  document.getElementById('cpName')!.style.color = col;
  document.getElementById('cpDesc')!.textContent = t.desc;

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
  const stats = document.getElementById('cpStats')!;
  stats.textContent = '';
  stats.appendChild(mkBar('HP', t.hp, 200, '#4f4'));
  stats.appendChild(mkBar('SPEED', t.spd, 260, '#4cf'));
  stats.appendChild(mkBar('DAMAGE', t.dmg, 18, '#f64'));
  stats.appendChild(mkBar('RANGE', t.rng, 600, '#fc4'));
  stats.appendChild(mkBar('MASS', t.mass, 30, '#c8f'));
  const atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = ': ' + t.atk;
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
  const list = document.getElementById('catList')!;
  list.textContent = '';
  TYPES.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'catItem' + (i === catSelected ? ' active' : '');
    const c = gC(i, 0);
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
    nameDiv.textContent = t.nm;
    info.appendChild(nameDiv);
    const typeDiv = document.createElement('div');
    typeDiv.className = 'ciType';
    typeDiv.textContent = t.atk;
    info.appendChild(typeDiv);
    item.appendChild(info);
    item.onclick = ((idx: number) => () => {
      setCatSelected(idx);
      buildCatUI();
      setupCatDemo(idx);
      updateCatPanel();
    })(i);
    list.appendChild(item);
  });
}

export function toggleCat() {
  setCatalogOpen(!catalogOpen);
  document.getElementById('catalog')!.classList.toggle('open', catalogOpen);
  if (catalogOpen) {
    buildCatUI();
    updateCatPanel();
    setupCatDemo(catSelected);
  }
}
