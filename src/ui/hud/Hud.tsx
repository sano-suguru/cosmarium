import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { TEAM_HEX_COLORS } from '../../colors.ts';
import { getVariantDef } from '../../mothership-variants.ts';
import { mothershipIdx, mothershipVariant, poolCounts, teamUnitCounts, unit } from '../../pools.ts';
import { getProductionTime } from '../../production-config.ts';
import { getRunInfo } from '../../run.ts';
import type { BattlePhase, ProductionSlot, ProductionState, RunStatus, Team } from '../../types.ts';
import { NO_UNIT, TEAM0, teamsOf } from '../../types.ts';
import { TYPES } from '../../unit-types.ts';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { timeScale$ } from '../signals.ts';
import styles from './Hud.module.css';

const hudCountA$ = signal(0);
const hudCountB$ = signal(0);
const hudParticles$ = signal(0);
const hudFps$ = signal(0);

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

interface SlotHudEntry {
  readonly slotIndex: number;
  readonly name: string;
  readonly clusterSize: number;
  readonly timerPct: number;
}
const hudProductionSlots$ = signal<readonly SlotHudEntry[]>([]);

/** 5%刻みに量子化して変更検出の頻度を下げる */
function computeTimerPct(slot: ProductionSlot, timer: number, variantMul: number): number {
  const productionTime = getProductionTime(slot.type, variantMul);
  const pctRaw = Math.min(timer / productionTime, 1);
  return Math.round(pctRaw * 20) / 20;
}

/** 前回の HUD エントリと比較し、変更があれば true を返す */
function hasProductionHudChanged(prev: readonly SlotHudEntry[], ps: ProductionState, variantMul: number): boolean {
  let idx = 0;
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    if (!slot) {
      continue;
    }
    const timer = ps.timers[i] ?? 0;
    const p = prev[idx];
    const t = TYPES[slot.type];
    if (
      !p ||
      p.timerPct !== computeTimerPct(slot, timer, variantMul) ||
      p.slotIndex !== i ||
      p.name !== (t?.name ?? '?') ||
      p.clusterSize !== slot.count
    ) {
      return true;
    }
    idx++;
  }
  return idx !== prev.length;
}

/** HUD エントリを構築する（変更確認済みの場合のみ呼ぶこと） */
function buildEntries(ps: ProductionState, variantMul: number): readonly SlotHudEntry[] {
  const result: SlotHudEntry[] = [];
  for (let i = 0; i < ps.slots.length; i++) {
    const slot = ps.slots[i];
    if (!slot) {
      continue;
    }
    const timer = ps.timers[i] ?? 0;
    const t = TYPES[slot.type];
    result.push({
      slotIndex: i,
      name: t?.name ?? '?',
      clusterSize: slot.count,
      timerPct: computeTimerPct(slot, timer, variantMul),
    });
  }
  return result;
}

/** 変更がなければ signal 更新をスキップ */
export function updateProductionHud(ps: ProductionState): void {
  if (ps.slots.length === 0) {
    if (hudProductionSlots$.peek().length !== 0) {
      hudProductionSlots$.value = [];
    }
    return;
  }
  const variantMul = getVariantDef(mothershipVariant[TEAM0]).productionRateMul;
  const prev = hudProductionSlots$.peek();
  if (hasProductionHudChanged(prev, ps, variantMul)) {
    hudProductionSlots$.value = buildEntries(ps, variantMul);
  }
}

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

function ProductionBar() {
  const entries = hudProductionSlots$.value;
  if (entries.length === 0) {
    return null;
  }

  return (
    <div class={styles.production}>
      <span class={styles.hl}>PRODUCTION:</span>{' '}
      {entries.map((e, i) => (
        <span key={e.slotIndex}>
          {i > 0 && ' | '}
          {e.name} x{e.clusterSize} [{(e.timerPct * 100).toFixed(0)}%]
        </span>
      ))}
    </div>
  );
}

function resetHudState() {
  hudCountA$.value = 0;
  hudCountB$.value = 0;
  hudParticles$.value = 0;
  hudFps$.value = 0;
  hudBattlePhase$.value = 'spectate';
  hudRoundInfo$.value = null;
  hudMeleeTeams$.value = [];
  hudMeleeTeamCounts$.value = [];
  hudMhpBars$.value = [];
  hudProductionSlots$.value = [];
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
        {roundInfo && <RunInfoBar info={roundInfo} class={styles.roundInfo} livesClass={styles.lives} />}
        <TeamRow />
        <ProductionBar />
        <div>
          <span class={styles.hl}>PARTICLES:</span> {hudParticles$.value}
        </div>
        <div>
          <span class={styles.hl}>FPS:</span> {hudFps$.value}{' '}
          <span class={styles.hl} style={{ marginLeft: '8px' }}>
            SPD:
          </span>{' '}
          {timeScale$.value}x
        </div>
      </div>
    </>
  );
}
