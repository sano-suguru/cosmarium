import { gC } from '../colors.ts';
import { PP, PPR } from '../constants.ts';
import { poolCounts, pP, prP, uP } from '../pools.ts';
import { killU, spU } from '../simulation/spawn.ts';
import { beams, catalogOpen, catSelected, setCatalogOpen, setCatSelected } from '../state.ts';
import { TYPES } from '../unit-types.ts';

var catDemoUnits: number[] = [];
var catDemoTimer = 0;

function setupCatDemo(typeIdx: number) {
  for (var i = 0; i < PP; i++) {
    var p = pP[i]!;
    if (p.alive) {
      p.alive = false;
      poolCounts.pC--;
    }
  }
  for (var i = 0; i < PPR; i++) {
    var pr = prP[i]!;
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

  var t = TYPES[typeIdx]!;
  var mi = spU(0, typeIdx, 0, 0);
  if (mi >= 0) {
    catDemoUnits.push(mi);
    uP[mi]!.ang = 0;
  }

  if (t.heals) {
    var ai = spU(0, 1, -60, 0);
    if (ai >= 0) {
      catDemoUnits.push(ai);
      uP[ai]!.hp = 3;
    }
    var ai2 = spU(0, 0, 60, -40);
    if (ai2 >= 0) {
      catDemoUnits.push(ai2);
      uP[ai2]!.hp = 1;
    }
    for (var i = 0; i < 3; i++) {
      var ei = spU(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.reflects) {
    for (var i = 0; i < 5; i++) {
      var ei = spU(1, 1, 180 + Math.random() * 60, (i - 2) * 50);
      if (ei >= 0) {
        catDemoUnits.push(ei);
        uP[ei]!.tgt = mi;
      }
    }
  } else if (t.spawns) {
    for (var i = 0; i < 4; i++) {
      var ei = spU(1, 0, 200 + (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 150);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.emp) {
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * 6.283,
        r = 80 + Math.random() * 60;
      var ei = spU(1, 0, Math.cos(a) * r, Math.sin(a) * r);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.chain) {
    for (var i = 0; i < 6; i++) {
      var ei = spU(1, 0, 120 + i * 35, (i % 2 === 0 ? -1 : 1) * (30 + i * 10));
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.teleports) {
    for (var i = 0; i < 4; i++) {
      var ei = spU(1, 1, 250 + (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  } else if (t.rams) {
    for (var i = 0; i < 3; i++) {
      var ei = spU(1, 3, 250, (i - 1) * 80);
      if (ei >= 0) catDemoUnits.push(ei);
    }
    if (mi >= 0) uP[mi]!.x = -200;
  } else {
    var cnt: number;
    if (t.sh === 3) cnt = 6;
    else if (t.sh === 8) cnt = 2;
    else cnt = 4;
    for (var i = 0; i < cnt; i++) {
      var ei = spU(1, 0, 200 + Math.random() * 100, (Math.random() - 0.5) * 200);
      if (ei >= 0) catDemoUnits.push(ei);
    }
  }
}

export function updateCatDemo(dt: number) {
  catDemoTimer += dt;
  if (catDemoTimer > 3) {
    catDemoTimer = 0;
    var ec = 0;
    catDemoUnits.forEach((idx) => {
      var unit = uP[idx]!;
      if (unit.alive && unit.team === 1) ec++;
    });
    if (ec < 2) setupCatDemo(catSelected);
  }
  catDemoUnits.forEach((idx) => {
    var u = uP[idx]!;
    if (!u.alive) return;
    if (u.team === 0 && !TYPES[u.type]!.rams) {
      u.x += (0 - u.x) * dt * 0.5;
      u.y += (0 - u.y) * dt * 0.5;
    }
    if (u.team === 1) u.hp = Math.min(u.mhp, u.hp + dt * 2);
  });
}

function updateCatPanel() {
  var t = TYPES[catSelected]!;
  var c0 = gC(catSelected, 0),
    c1 = gC(catSelected, 1);
  var col = 'rgb(' + ((c0[0] * 255) | 0) + ',' + ((c0[1] * 255) | 0) + ',' + ((c0[2] * 255) | 0) + ')';
  var col2 = 'rgb(' + ((c1[0] * 255) | 0) + ',' + ((c1[1] * 255) | 0) + ',' + ((c1[2] * 255) | 0) + ')';
  document.getElementById('cpName')!.textContent = t.nm;
  document.getElementById('cpName')!.style.color = col;
  document.getElementById('cpDesc')!.textContent = t.desc;

  var mkBar = (label: string, val: number, max: number, color: string): DocumentFragment => {
    var frag = document.createDocumentFragment();
    var lbl = document.createElement('div');
    lbl.textContent = label + ': ' + val;
    frag.appendChild(lbl);
    var barOuter = document.createElement('div');
    barOuter.className = 'cpBar';
    var barInner = document.createElement('div');
    barInner.style.width = (val / max) * 100 + '%';
    barInner.style.background = color;
    barOuter.appendChild(barInner);
    frag.appendChild(barOuter);
    return frag;
  };
  var stats = document.getElementById('cpStats')!;
  stats.textContent = '';
  stats.appendChild(mkBar('HP', t.hp, 200, '#4f4'));
  stats.appendChild(mkBar('SPEED', t.spd, 260, '#4cf'));
  stats.appendChild(mkBar('DAMAGE', t.dmg, 18, '#f64'));
  stats.appendChild(mkBar('RANGE', t.rng, 600, '#fc4'));
  stats.appendChild(mkBar('MASS', t.mass, 30, '#c8f'));
  var atkDiv = document.createElement('div');
  atkDiv.style.marginTop = '8px';
  atkDiv.style.color = col;
  atkDiv.textContent = ': ' + t.atk;
  stats.appendChild(atkDiv);
  var teamDiv = document.createElement('div');
  teamDiv.style.marginTop = '4px';
  teamDiv.style.fontSize = '9px';
  teamDiv.style.color = '#666';
  teamDiv.appendChild(document.createTextNode('Team colors: '));
  var spanA = document.createElement('span');
  spanA.style.color = col;
  spanA.textContent = 'A';
  teamDiv.appendChild(spanA);
  teamDiv.appendChild(document.createTextNode(' vs '));
  var spanB = document.createElement('span');
  spanB.style.color = col2;
  spanB.textContent = 'B';
  teamDiv.appendChild(spanB);
  stats.appendChild(teamDiv);
}

function buildCatUI() {
  var list = document.getElementById('catList')!;
  list.textContent = '';
  TYPES.forEach((t, i) => {
    var item = document.createElement('div');
    item.className = 'catItem' + (i === catSelected ? ' active' : '');
    var c = gC(i, 0);
    var rgb = 'rgb(' + ((c[0] * 255) | 0) + ',' + ((c[1] * 255) | 0) + ',' + ((c[2] * 255) | 0) + ')';
    var dot = document.createElement('div');
    dot.className = 'ciDot';
    dot.style.background = rgb;
    dot.style.boxShadow = '0 0 6px ' + rgb;
    item.appendChild(dot);
    var info = document.createElement('div');
    var nameDiv = document.createElement('div');
    nameDiv.className = 'ciName';
    nameDiv.style.color = rgb;
    nameDiv.textContent = t.nm;
    info.appendChild(nameDiv);
    var typeDiv = document.createElement('div');
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
