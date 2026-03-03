import { TEAM_HEX_COLORS } from '../colors.ts';
import { poolCounts, teamUnitCounts } from '../pools.ts';
import type { BattlePhase } from '../simulation/update.ts';
import type { Team } from '../types.ts';
import { DOM_ID_COUNT_A, DOM_ID_COUNT_B, DOM_ID_FPS, DOM_ID_MELEE_TEAMS, DOM_ID_PARTICLE_NUM } from './dom-ids.ts';
import { getElement } from './dom-util.ts';

interface HudState {
  readonly countA: HTMLElement;
  readonly countB: HTMLElement;
  readonly particleNum: HTMLElement;
  readonly fps: HTMLElement;
  readonly teamRow: HTMLElement;
  readonly meleeContainer: HTMLElement;
  meleeSpans: HTMLSpanElement[];
}

let _state: HudState | null = null;

function st(): HudState {
  if (!_state) throw new Error('initHUD() has not been called');
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

  for (let i = 0; i < numTeams; i++) {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'hl';
      sep.textContent = '/';
      s.meleeContainer.appendChild(sep);
    }
    const span = document.createElement('span');
    span.style.color = TEAM_HEX_COLORS[i as Team];
    span.textContent = '0';
    s.meleeContainer.appendChild(span);
    s.meleeSpans.push(span);
  }
}

export function teardownMeleeHUD() {
  const s = st();
  s.teamRow.style.display = '';
  s.meleeContainer.style.display = 'none';
  s.meleeContainer.textContent = '';
  s.meleeSpans = [];
}

export function updateHUD(displayFps: number, battlePhase: BattlePhase) {
  const s = st();

  if (battlePhase === 'melee' || battlePhase === 'meleeEnding') {
    for (let i = 0; i < s.meleeSpans.length; i++) {
      const span = s.meleeSpans[i];
      if (span) span.textContent = `${teamUnitCounts[i as Team]}`;
    }
  } else {
    s.countA.textContent = `${teamUnitCounts[0]}`;
    s.countB.textContent = `${teamUnitCounts[1]}`;
  }
  s.particleNum.textContent = `${poolCounts.particles + poolCounts.projectiles}`;
  s.fps.textContent = `${displayFps}`;
}
