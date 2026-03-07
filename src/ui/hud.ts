import { TEAM_HEX_COLORS } from '../colors.ts';
import { mothershipIdx, poolCounts, teamUnitCounts, unit } from '../pools.ts';
import type { BattlePhase, Team } from '../types.ts';
import { NO_UNIT, teamsOf } from '../types.ts';
import {
  DOM_ID_COUNT_A,
  DOM_ID_COUNT_B,
  DOM_ID_FPS,
  DOM_ID_MELEE_TEAMS,
  DOM_ID_MOTHERSHIP_HP,
  DOM_ID_PARTICLE_NUM,
} from './dom-ids.ts';
import { getElement } from './dom-util.ts';

interface HudState {
  readonly countA: HTMLElement;
  readonly countB: HTMLElement;
  readonly particleNum: HTMLElement;
  readonly fps: HTMLElement;
  readonly teamRow: HTMLElement;
  readonly meleeContainer: HTMLElement;
  readonly mothershipHp: HTMLElement;
  mhpBars: { el: HTMLElement; team: Team; prevWidth: string; prevClr: string }[];
  meleeSpans: { el: HTMLSpanElement; team: Team }[];
}

let _state: HudState | null = null;

function st(): HudState {
  if (!_state) {
    throw new Error('initHUD() has not been called');
  }
  return _state;
}

export function initHUD() {
  _state = {
    countA: getElement(DOM_ID_COUNT_A),
    countB: getElement(DOM_ID_COUNT_B),
    particleNum: getElement(DOM_ID_PARTICLE_NUM),
    fps: getElement(DOM_ID_FPS),
    teamRow: getElement('hudTeamRow'),
    meleeContainer: getElement(DOM_ID_MELEE_TEAMS),
    mothershipHp: getElement(DOM_ID_MOTHERSHIP_HP),
    mhpBars: [],
    meleeSpans: [],
  };
}

export function setupMeleeHUD(numTeams: number) {
  const s = st();
  s.teamRow.style.display = 'none';
  s.meleeContainer.style.display = 'flex';
  s.meleeContainer.textContent = '';
  s.meleeSpans = [];

  const label = document.createElement('span');
  label.className = 'hl';
  label.textContent = 'UNITS:';
  s.meleeContainer.appendChild(label);

  for (const t of teamsOf(numTeams)) {
    if (t > 0) {
      const sep = document.createElement('span');
      sep.className = 'hl';
      sep.textContent = '/';
      s.meleeContainer.appendChild(sep);
    }
    const span = document.createElement('span');
    span.style.color = TEAM_HEX_COLORS[t];
    span.textContent = '0';
    s.meleeContainer.appendChild(span);
    s.meleeSpans.push({ el: span, team: t });
  }
}

export function teardownMeleeHUD() {
  const s = st();
  s.teamRow.style.display = '';
  s.meleeContainer.style.display = 'none';
  s.meleeContainer.textContent = '';
  s.meleeSpans = [];
}

function updateMothershipHpBar(bar: HudState['mhpBars'][number]) {
  const idx = mothershipIdx[bar.team];
  let w: string;
  let c: string;
  if (idx === NO_UNIT) {
    w = '0%';
    c = '#600';
  } else {
    const u = unit(idx);
    if (!u.alive) {
      w = '0%';
      c = '#600';
    } else {
      const ratio = Math.max(0, u.hp / u.maxHp);
      w = `${(ratio * 100).toFixed(1)}%`;
      c = ratio < 0.25 ? '#f22' : TEAM_HEX_COLORS[bar.team];
    }
  }
  if (w !== bar.prevWidth) {
    bar.el.style.width = w;
    bar.prevWidth = w;
  }
  if (c !== bar.prevClr) {
    bar.el.style.setProperty('--mhp-clr', c);
    bar.prevClr = c;
  }
}

export function showMothershipHpBar(numTeams: number) {
  const s = st();
  const container = s.mothershipHp;
  container.textContent = '';
  s.mhpBars = [];

  for (const t of teamsOf(numTeams)) {
    const item = document.createElement('div');
    item.className = 'mhp-item';

    const label = document.createElement('span');
    label.className = 'mhp-label';
    label.textContent = 'MOTHERSHIP';
    item.appendChild(label);

    const track = document.createElement('div');
    track.className = 'mhp-track';
    const fill = document.createElement('div');
    fill.className = 'mhp-fill';
    fill.style.setProperty('--mhp-clr', TEAM_HEX_COLORS[t]);
    track.appendChild(fill);
    item.appendChild(track);

    container.appendChild(item);
    s.mhpBars.push({ el: fill, team: t, prevWidth: '', prevClr: '' });
  }

  container.style.display = 'flex';
}

export function hideMothershipHpBar() {
  const s = st();
  s.mothershipHp.style.display = 'none';
  s.mothershipHp.textContent = '';
  s.mhpBars = [];
}

export function updateHUD(displayFps: number, battlePhase: BattlePhase) {
  const s = st();

  if (battlePhase === 'melee' || battlePhase === 'meleeEnding') {
    for (const { el, team } of s.meleeSpans) {
      el.textContent = `${teamUnitCounts[team]}`;
    }
  } else {
    s.countA.textContent = `${teamUnitCounts[0]}`;
    s.countB.textContent = `${teamUnitCounts[1]}`;
  }

  if (battlePhase !== 'aftermath') {
    for (const bar of s.mhpBars) {
      updateMothershipHpBar(bar);
    }
  }

  s.particleNum.textContent = `${poolCounts.particles + poolCounts.projectiles}`;
  s.fps.textContent = `${displayFps}`;
}
