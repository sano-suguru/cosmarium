import { TEAM_UI_HEX_COLORS } from '../colors.ts';
import type { MeleeResult } from '../melee-tracker.ts';
import type { BattleResult, Team } from '../types.ts';
import {
  DOM_ID_RESULT,
  DOM_ID_RESULT_MENU,
  DOM_ID_RESULT_RECOMPOSE,
  DOM_ID_RESULT_REMATCH,
  DOM_ID_RESULT_STATS,
  DOM_ID_RESULT_TITLE,
} from './dom-ids.ts';
import { getElement } from './dom-util.ts';

type ResultCb = () => void;

let onRecompose: ResultCb = () => undefined;
let onRematch: ResultCb = () => undefined;

interface ResultEls {
  readonly result: HTMLElement;
  readonly title: HTMLElement;
  readonly stats: HTMLElement;
}

let _els: ResultEls | undefined;

function els(): ResultEls {
  if (!_els) {
    throw new Error('initResultDOM() has not been called');
  }
  return _els;
}

export function initResultDOM(menuCb: ResultCb, recomposeCb: ResultCb, rematchCb: ResultCb) {
  onRecompose = recomposeCb;
  onRematch = rematchCb;

  _els = {
    result: getElement(DOM_ID_RESULT),
    title: getElement(DOM_ID_RESULT_TITLE),
    stats: getElement(DOM_ID_RESULT_STATS),
  };

  const elMenu = getElement(DOM_ID_RESULT_MENU);
  const elRecompose = getElement(DOM_ID_RESULT_RECOMPOSE);
  const elRematch = getElement(DOM_ID_RESULT_REMATCH);

  elMenu.addEventListener('click', () => {
    menuCb();
  });

  elRecompose.addEventListener('click', () => {
    onRecompose();
  });

  elRematch.addEventListener('click', () => {
    onRematch();
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Result パネルの全状態を初期化。各 show* 関数の冒頭で呼び、前回の残骸を一掃する。 */
function resetResultPanel() {
  const d = els();
  d.title.textContent = '';
  d.title.className = 'result-title';
  d.title.removeAttribute('style');
  d.stats.textContent = '';
  getElement(DOM_ID_RESULT_RECOMPOSE).style.display = '';
  getElement(DOM_ID_RESULT_REMATCH).style.display = '';
}

export function showResult(result: BattleResult) {
  const d = els();
  resetResultPanel();

  if (result.victory) {
    d.title.textContent = 'VICTORY';
    d.title.className = 'result-title victory';
  } else {
    d.title.textContent = 'DEFEAT';
    d.title.className = 'result-title defeat';
  }

  const lines: [string, string][] = [
    ['戦闘時間:', formatTime(result.elapsed)],
    ['残存艦艇:', `${result.playerSurvivors} / ${result.initialPlayerUnits}`],
    ['撃破敵艦:', String(result.enemyKills)],
    ['自軍損失:', String(result.playerLosses)],
  ];
  for (const [label, value] of lines) {
    const row = document.createElement('div');
    const span = document.createElement('span');
    span.className = 'label';
    span.textContent = label;
    row.append(span, `  ${value}`);
    d.stats.appendChild(row);
  }

  d.result.classList.add('open');
}

function teamUiHex(team: Team): string {
  return TEAM_UI_HEX_COLORS[team];
}

function makeTeamDot(hex: string): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = 'melee-dot';
  dot.style.background = hex;
  dot.style.boxShadow = `0 0 6px ${hex}, 0 0 12px ${hex}60`;
  return dot;
}

function compareMeleeTeams(a: number, b: number, result: MeleeResult, elimMap: Map<number, number>): number {
  const sa = result.teamStats[a];
  const sb = result.teamStats[b];
  if (!sa || !sb) {
    return 0;
  }
  const aAlive = sa.survivors > 0;
  const bAlive = sb.survivors > 0;
  if (aAlive !== bAlive) {
    return aAlive ? -1 : 1;
  }
  if (!aAlive) {
    const diff = (elimMap.get(b) ?? 0) - (elimMap.get(a) ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  const killDiff = sb.kills - sa.kills;
  if (killDiff !== 0) {
    return killDiff;
  }
  return a - b;
}

function buildMeleeRanking(result: MeleeResult, elimMap: Map<number, number>): number[] {
  const ranking: number[] = [];
  for (let i = 0; i < result.numTeams; i++) {
    ranking.push(i);
  }

  ranking.sort((a, b) => compareMeleeTeams(a, b, result, elimMap));

  return ranking;
}

function buildScoreRow(
  rank: number,
  teamIdx: number,
  stats: { kills: number; survivors: number; initialUnits: number },
  elimMap: Map<number, number>,
  maxKills: number,
): HTMLDivElement {
  const hex = teamUiHex(teamIdx as Team);
  const row = document.createElement('div');
  row.className = `melee-score-row melee-rank-${rank + 1}`;
  row.style.animationDelay = `${rank * 0.1}s`;

  if (rank === 0) {
    row.style.background = `linear-gradient(90deg, ${hex}18, transparent 70%)`;
    row.style.color = hex;
  }

  const rankEl = document.createElement('span');
  rankEl.className = 'melee-rank';
  rankEl.textContent = `#${rank + 1}`;

  const name = document.createElement('span');
  name.className = 'melee-team-name';
  name.textContent = `TEAM ${teamIdx + 1}`;

  const killsWrap = document.createElement('span');
  killsWrap.className = 'melee-kills-wrap';

  const killsBar = document.createElement('span');
  killsBar.className = 'melee-kills-bar';
  const barWidth = maxKills > 0 ? (stats.kills / maxKills) * 48 : 0;
  killsBar.style.width = `${barWidth}px`;
  killsBar.style.background = hex;

  const kills = document.createElement('span');
  kills.className = 'melee-kills';
  kills.textContent = `${String(stats.kills).padStart(3, ' ')} KILLS`;

  killsWrap.append(killsBar, kills);

  const status = document.createElement('span');
  status.className = 'melee-status';
  if (stats.survivors > 0) {
    status.textContent = `残存 ${stats.survivors}/${stats.initialUnits}`;
  } else {
    status.classList.add('eliminated');
    const elimTime = elimMap.get(teamIdx);
    status.textContent = `全滅 ${elimTime !== undefined ? formatTime(elimTime) : '-'}`;
  }

  row.append(rankEl, makeTeamDot(hex), name, killsWrap, status);
  return row;
}

function buildTimelineRow(evTeam: Team, evElapsed: number, delayIndex: number): HTMLDivElement {
  const hex = teamUiHex(evTeam);
  const row = document.createElement('div');
  row.className = 'melee-timeline-row';
  row.style.animationDelay = `${delayIndex * 0.08}s`;

  const time = document.createElement('span');
  time.className = 'melee-timeline-time';
  time.textContent = formatTime(evElapsed);

  const label = document.createElement('span');
  label.className = 'melee-timeline-label';

  const text = document.createElement('span');
  text.textContent = `TEAM ${evTeam + 1} 全滅`;

  label.append(makeTeamDot(hex), text);
  row.append(time, label);
  return row;
}

function renderMeleeTitle(el: HTMLElement, result: MeleeResult) {
  if (result.winnerTeam !== null) {
    const hex = teamUiHex(result.winnerTeam);
    el.textContent = `TEAM ${result.winnerTeam + 1} WINS`;
    el.className = 'result-title victory';
    el.style.background = `linear-gradient(135deg, ${hex}, #0ff, ${hex})`;
    el.style.backgroundClip = 'text';
    el.style.webkitBackgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
    el.style.textShadow = `0 0 30px ${hex}, 0 0 60px ${hex}50, 0 0 100px rgba(0,255,255,0.15)`;
  } else {
    el.textContent = 'DRAW';
    el.className = 'result-title defeat';
  }
}

function computeMaxKills(result: MeleeResult): number {
  let max = 0;
  for (let i = 0; i < result.numTeams; i++) {
    const s = result.teamStats[i];
    if (s && s.kills > max) {
      max = s.kills;
    }
  }
  return max;
}

export function showMeleeResult(result: MeleeResult) {
  const d = els();
  resetResultPanel();
  renderMeleeTitle(d.title, result);

  const infoRow = document.createElement('div');
  infoRow.className = 'melee-info';

  const timeSpan = document.createElement('span');
  const timeLabel = document.createElement('span');
  timeLabel.className = 'label';
  timeLabel.textContent = '戦闘時間:';
  timeSpan.append(timeLabel, ` ${formatTime(result.elapsed)}`);

  const teamSpan = document.createElement('span');
  const teamLabel = document.createElement('span');
  teamLabel.className = 'label';
  teamLabel.textContent = '初期勢力:';
  teamSpan.append(teamLabel, ` ${result.numTeams}`);

  infoRow.append(timeSpan, teamSpan);
  d.stats.appendChild(infoRow);

  const elimMap = new Map<number, number>();
  for (const ev of result.eliminations) {
    elimMap.set(ev.team, ev.elapsed);
  }

  const ranking = buildMeleeRanking(result, elimMap);
  const maxKills = computeMaxKills(result);

  const scoreHeader = document.createElement('div');
  scoreHeader.className = 'melee-section-header';
  scoreHeader.textContent = 'SCOREBOARD';
  d.stats.appendChild(scoreHeader);

  for (let rank = 0; rank < ranking.length; rank++) {
    const teamIdx = ranking[rank] as number;
    const stats = result.teamStats[teamIdx];
    if (!stats) {
      continue;
    }
    d.stats.appendChild(buildScoreRow(rank, teamIdx, stats, elimMap, maxKills));
  }

  if (result.eliminations.length > 0) {
    const tlHeader = document.createElement('div');
    tlHeader.className = 'melee-section-header';
    tlHeader.textContent = 'ELIMINATION TIMELINE';
    d.stats.appendChild(tlHeader);

    for (let i = 0; i < result.eliminations.length; i++) {
      const ev = result.eliminations[i];
      if (!ev) {
        continue;
      }
      d.stats.appendChild(buildTimelineRow(ev.team, ev.elapsed, ranking.length + i));
    }
  }

  // MELEE: RECOMPOSE/REMATCH を非表示、MENU のみ
  getElement(DOM_ID_RESULT_RECOMPOSE).style.display = 'none';
  getElement(DOM_ID_RESULT_REMATCH).style.display = 'none';

  d.result.classList.add('open');
}

export function hideResult() {
  els().result.classList.remove('open');
}

export function reopenResult() {
  els().result.classList.add('open');
}
