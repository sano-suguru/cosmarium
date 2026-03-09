import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { TEAM_HEX_COLORS } from '../../colors.ts';
import { mothershipIdx, poolCounts, teamUnitCounts, unit } from '../../pools.ts';
import { getRunInfo } from '../../run.ts';
import type { BattlePhase, RunStatus, Team } from '../../types.ts';
import { NO_UNIT, teamsOf } from '../../types.ts';
import { formatLivesText } from '../format.ts';
import styles from './Hud.module.css';

// --- Signals (per-frame update) ---
const hudCountA$ = signal(0);
const hudCountB$ = signal(0);
const hudParticles$ = signal(0);
const hudFps$ = signal(0);

// --- Signals (config / state-change) ---
const hudSpeed$ = signal(1);

export function setHudSpeed(speed: number) {
  hudSpeed$.value = speed;
}
const hudBattlePhase$ = signal<BattlePhase>('spectate');
const hudRoundInfo$ = signal<RunStatus | null>(null);

/** Melee 用チーム一覧（空なら battle/spectate モード） */
const hudMeleeTeams$ = signal<readonly Team[]>([]);
const hudMeleeTeamCounts$ = signal<readonly number[]>([]);

interface MhpBarData {
  readonly team: Team;
  readonly widthPct: string;
  readonly clr: string;
}
const hudMhpBars$ = signal<readonly MhpBarData[]>([]);

// --- API: game-control / main から呼ばれる関数 ---

export function setupMeleeHUD(numTeams: number) {
  hudMeleeTeams$.value = [...teamsOf(numTeams)];
  hudMeleeTeamCounts$.value = new Array<number>(numTeams).fill(0);
}

export function teardownMeleeHUD() {
  hudMeleeTeams$.value = [];
  hudMeleeTeamCounts$.value = [];
}

export function showMothershipHpBar(numTeams: number) {
  const bars: MhpBarData[] = [];
  for (const t of teamsOf(numTeams)) {
    bars.push({ team: t, widthPct: '100%', clr: TEAM_HEX_COLORS[t] });
  }
  hudMhpBars$.value = bars;
}

export function hideMothershipHpBar() {
  hudMhpBars$.value = [];
}

export function updateHudRoundInfo() {
  hudRoundInfo$.value = getRunInfo();
}

function computeMhpBar(prev: MhpBarData): MhpBarData {
  const idx = mothershipIdx[prev.team];
  if (idx === NO_UNIT) {
    return { team: prev.team, widthPct: '0%', clr: '#600' };
  }
  const u = unit(idx);
  if (!u.alive) {
    return { team: prev.team, widthPct: '0%', clr: '#600' };
  }
  const ratio = Math.max(0, u.hp / u.maxHp);
  const widthPct = `${(ratio * 100).toFixed(1)}%`;
  const clr = ratio < 0.25 ? '#f22' : TEAM_HEX_COLORS[prev.team];
  return { team: prev.team, widthPct, clr };
}

function updateMhpBars() {
  const prev = hudMhpBars$.peek();
  if (prev.length === 0) {
    return;
  }
  let changed = false;
  const next: MhpBarData[] = [];
  for (const prevBar of prev) {
    const newBar = computeMhpBar(prevBar);
    if (newBar.widthPct !== prevBar.widthPct || newBar.clr !== prevBar.clr) {
      changed = true;
    }
    next.push(newBar);
  }
  if (changed) {
    hudMhpBars$.value = next;
  }
}

function updateMeleeTeamCounts() {
  const teams = hudMeleeTeams$.value;
  const prev = hudMeleeTeamCounts$.peek();
  let changed = prev.length !== teams.length;
  const counts: number[] = [];
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    if (!t && t !== 0) {
      continue;
    }
    const c = teamUnitCounts[t];
    counts.push(c);
    if (!changed && prev[i] !== c) {
      changed = true;
    }
  }
  if (changed) {
    hudMeleeTeamCounts$.value = counts;
  }
}

export function updateHUD(displayFps: number, battlePhase: BattlePhase) {
  if (hudBattlePhase$.peek() !== battlePhase) {
    hudBattlePhase$.value = battlePhase;
  }

  if (battlePhase === 'melee' || battlePhase === 'meleeEnding') {
    updateMeleeTeamCounts();
  } else {
    const a = teamUnitCounts[0];
    const b = teamUnitCounts[1];
    if (hudCountA$.peek() !== a) {
      hudCountA$.value = a;
    }
    if (hudCountB$.peek() !== b) {
      hudCountB$.value = b;
    }
  }

  if (battlePhase !== 'aftermath') {
    updateMhpBars();
  }

  const p = poolCounts.particles + poolCounts.projectiles;
  if (hudParticles$.peek() !== p) {
    hudParticles$.value = p;
  }
  if (hudFps$.peek() !== displayFps) {
    hudFps$.value = displayFps;
  }
}

// --- Components ---

function RoundInfo({ info }: { info: RunStatus }) {
  return (
    <div class={styles.roundInfo}>
      {`ROUND ${info.round} \u00a0 `}
      <span class={styles.lives}>{formatLivesText(info.lives)}</span>
      {` \u00a0 ${info.wins}/${info.winTarget} WINS`}
    </div>
  );
}

function MhpBar({ bar }: { bar: MhpBarData }) {
  return (
    <div class={styles.mhpItem}>
      <span class={styles.mhpLabel}>MOTHERSHIP</span>
      <div class={styles.mhpTrack}>
        <div
          class={styles.mhpFill}
          style={{ width: bar.widthPct, background: bar.clr, boxShadow: `0 0 6px ${bar.clr}` }}
        />
      </div>
    </div>
  );
}

function MothershipHpBar() {
  const bars = hudMhpBars$.value;
  if (bars.length === 0) {
    return null;
  }
  return (
    <div class={styles.mothershipHp}>
      {bars.map((b) => (
        <MhpBar key={b.team} bar={b} />
      ))}
    </div>
  );
}

function TeamRow() {
  const phase = hudBattlePhase$.value;
  const isMelee = phase === 'melee' || phase === 'meleeEnding';

  if (isMelee) {
    const teams = hudMeleeTeams$.value;
    const counts = hudMeleeTeamCounts$.value;
    return (
      <div class={styles.meleeTeams}>
        <span class={styles.hl}>UNITS:</span>
        {teams.map((t, i) => (
          <span key={t}>
            {i > 0 && <span class={styles.hl}>/</span>}
            <span style={{ color: TEAM_HEX_COLORS[t] }}>{counts[i] ?? 0}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div>
      <span class={styles.hl}>UNITS:</span> <span class={styles.hc}>{hudCountA$.value}</span>{' '}
      <span class={styles.hl}>vs</span> <span class={styles.hm}>{hudCountB$.value}</span>
    </div>
  );
}

function resetHudState() {
  hudCountA$.value = 0;
  hudCountB$.value = 0;
  hudParticles$.value = 0;
  hudFps$.value = 0;
  hudSpeed$.value = 1;
  hudBattlePhase$.value = 'spectate';
  hudRoundInfo$.value = null;
  hudMeleeTeams$.value = [];
  hudMeleeTeamCounts$.value = [];
  hudMhpBars$.value = [];
}

export function Hud() {
  useEffect(() => {
    return () => resetHudState();
  }, []);

  const roundInfo = hudRoundInfo$.value;

  return (
    <>
      <MothershipHpBar />
      <div class={styles.container}>
        {roundInfo && <RoundInfo info={roundInfo} />}
        <TeamRow />
        <div>
          <span class={styles.hl}>PARTICLES:</span> {hudParticles$.value}
        </div>
        <div>
          <span class={styles.hl}>FPS:</span> {hudFps$.value}{' '}
          <span class={styles.hl} style={{ marginLeft: '8px' }}>
            SPD:
          </span>{' '}
          {hudSpeed$.value}x
        </div>
      </div>
    </>
  );
}
