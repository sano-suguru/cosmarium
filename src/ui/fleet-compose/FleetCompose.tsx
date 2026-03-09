import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { DEFAULT_BUDGET, SORTED_TYPE_INDICES } from '../../fleet-cost.ts';
import { getRunInfo } from '../../run.ts';
import type { FleetComposition, FleetEntry } from '../../types.ts';
import { TYPE_INDICES, TYPES } from '../../unit-types.ts';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { composeEnemyArchName$, composeEnemyFleet$ } from '../signals.ts';
import styles from './FleetCompose.module.css';

const REPEAT_DELAY = 200;
const REPEAT_INTERVAL = 40;

const counts$ = signal<readonly number[]>(TYPES.map(() => 0));

function usedBudget(counts: readonly number[]): number {
  let sum = 0;
  for (const idx of TYPE_INDICES) {
    sum += (counts[idx] ?? 0) * (TYPES[idx]?.cost ?? 0);
  }
  return sum;
}

function totalUnits(counts: readonly number[]): number {
  let sum = 0;
  for (const c of counts) {
    sum += c;
  }
  return sum;
}

function buildPlayerFleet(counts: readonly number[]): FleetComposition {
  const fleet: FleetEntry[] = [];
  for (const idx of TYPE_INDICES) {
    const c = counts[idx] ?? 0;
    if (c > 0) {
      fleet.push({ type: idx, count: c });
    }
  }
  return fleet;
}

export function getPlayerFleet(): FleetComposition {
  return buildPlayerFleet(counts$.value);
}

export function resetComposeCounts() {
  counts$.value = TYPES.map(() => 0);
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetComposeCounts();
}
function EnemyFleetHeader() {
  const fleet = composeEnemyFleet$.value;
  const archName = composeEnemyArchName$.value;

  return (
    <div class={styles.header}>
      <h2 class={styles.headerTitle}>ENEMY FLEET</h2>
      <div class={styles.enemyList}>
        <div class={styles.enemyArch}>{archName}</div>
        <div class={styles.enemyUnits}>
          {fleet.map((entry) => {
            const t = TYPES[entry.type];
            if (!t) {
              return null;
            }
            return (
              <span key={entry.type} class={styles.enemyUnit}>
                <span class={`${styles.dot} ${styles.dotTeam1}`} />
                {`${t.name} x${entry.count}`}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type UnitCardProps = {
  readonly typeIdx: number;
  readonly count: number;
  readonly remaining: number;
  readonly onPointerDown: (typeIdx: number, action: 'plus' | 'minus') => void;
};

function UnitCard({ typeIdx, count, remaining, onPointerDown }: UnitCardProps) {
  const t = TYPES[typeIdx];
  if (!t) {
    return null;
  }
  const cost = t.cost;

  return (
    <div class={styles.card}>
      <div class={styles.cardName}>
        <span class={`${styles.dot} ${styles.dotTeam0}`} />
        {t.name}
      </div>
      <div class={styles.cardCost}>{cost}pt</div>
      <div class={styles.controls}>
        <button
          type="button"
          class={styles.minus}
          aria-label="decrease"
          disabled={count <= 0}
          onPointerDown={() => onPointerDown(typeIdx, 'minus')}
        >
          -
        </button>
        <span class={styles.count}>{count}</span>
        <button
          type="button"
          class={styles.plus}
          aria-label="increase"
          disabled={cost > remaining}
          onPointerDown={() => onPointerDown(typeIdx, 'plus')}
        >
          +
        </button>
      </div>
    </div>
  );
}
type FleetComposeProps = {
  readonly onLaunch: (playerFleet: FleetComposition) => void;
  readonly onBack: () => void;
  readonly onCodexToggle: () => void;
};

export function FleetCompose({ onLaunch, onBack, onCodexToggle }: FleetComposeProps) {
  const repeatTimerRef = useRef(0);
  const repeatIntervalRef = useRef(0);

  useEffect(() => {
    const stopRepeat = () => {
      clearTimeout(repeatTimerRef.current);
      clearInterval(repeatIntervalRef.current);
      repeatTimerRef.current = 0;
      repeatIntervalRef.current = 0;
    };
    document.addEventListener('pointerup', stopRepeat);
    document.addEventListener('pointercancel', stopRepeat);
    return () => {
      stopRepeat();
      document.removeEventListener('pointerup', stopRepeat);
      document.removeEventListener('pointercancel', stopRepeat);
    };
  }, []);

  const counts = counts$.value;
  const used = usedBudget(counts);
  const remaining = DEFAULT_BUDGET - used;
  const total = totalUnits(counts);
  const runInfo = getRunInfo();

  const handlePointerDown = (typeIdx: number, action: 'plus' | 'minus') => {
    const exec = () => {
      const arr = [...counts$.value];
      const c = arr[typeIdx] ?? 0;
      if (action === 'minus') {
        if (c > 0) {
          arr[typeIdx] = c - 1;
          counts$.value = arr;
        }
      } else {
        const cost = TYPES[typeIdx]?.cost ?? 0;
        if (cost <= DEFAULT_BUDGET - usedBudget(arr)) {
          arr[typeIdx] = c + 1;
          counts$.value = arr;
        }
      }
    };
    exec();
    repeatTimerRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(exec, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  };

  const handleLaunch = () => {
    const fleet = buildPlayerFleet(counts$.value);
    if (fleet.length > 0) {
      onLaunch(fleet);
    }
  };

  const handleReset = () => {
    resetComposeCounts();
  };

  return (
    <>
      <div class={styles.compose}>
        {runInfo && <RunInfoBar info={runInfo} class={styles.roundInfo} livesClass={styles.lives} />}
        <EnemyFleetHeader />
        <div class={styles.body}>
          <div class={styles.budgetBar}>
            <span>FLEET COMPOSITION</span>
            <span>
              BUDGET: {used} / {DEFAULT_BUDGET}
            </span>
          </div>
          <div class={styles.grid}>
            {SORTED_TYPE_INDICES.map((typeIdx) => (
              <UnitCard
                key={typeIdx}
                typeIdx={typeIdx}
                count={counts[typeIdx] ?? 0}
                remaining={remaining}
                onPointerDown={handlePointerDown}
              />
            ))}
          </div>
          <div class={styles.footer}>
            <span>合計: {total}隻</span>
            <span>残り: {remaining}pt</span>
          </div>
        </div>
        <div class={styles.actions}>
          <button type="button" class="mbtn" onClick={onBack}>
            BACK
          </button>
          <button type="button" class={`mbtn ${styles.reset}`} onClick={handleReset}>
            RESET
          </button>
          <button type="button" class={`mbtn ${styles.launch}`} disabled={total === 0} onClick={handleLaunch}>
            LAUNCH BATTLE
          </button>
        </div>
      </div>
      <button type="button" class={styles.codexBtn} onClick={onCodexToggle}>
        TAB: CODEX
      </button>
    </>
  );
}
