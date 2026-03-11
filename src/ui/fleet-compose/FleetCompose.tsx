import { signal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { isPurchasable, SORTED_TYPE_INDICES } from '../../fleet-cost.ts';
import { getVariantDef, MOTHERSHIP_VARIANTS } from '../../mothership-variants.ts';
import { createProductionSlot, getProductionTime, SLOT_COUNT } from '../../production-config.ts';
import { getRunInfo } from '../../run.ts';
import type { UnitTypeIndex } from '../../types.ts';
import type { FleetSetup, MothershipVariant } from '../../types-fleet.ts';
import { ROLE_LABELS, unitTypeIdx } from '../../unit-type-accessors.ts';
import { TYPES } from '../../unit-types.ts';
import btnStyles from '../shared/button.module.css';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { composeEnemyArchName$, composeEnemySetup$ } from '../signals.ts';
import styles from './FleetCompose.module.css';

const PURCHASABLE_BY_ROLE = {
  attack: SORTED_TYPE_INDICES.filter((i) => TYPES[i]?.role === 'attack'),
  support: SORTED_TYPE_INDICES.filter((i) => TYPES[i]?.role === 'support'),
  special: SORTED_TYPE_INDICES.filter((i) => TYPES[i]?.role === 'special'),
} as const;

// 同一ユニットタイプの複数スロット選択は意図的（複数生産ラインの並行稼働）
const slots$ = signal<readonly (UnitTypeIndex | null)[]>(Array.from({ length: SLOT_COUNT }, () => null));
const variant$ = signal<MothershipVariant>(0);

function findDuplicateTypes(slots: readonly (UnitTypeIndex | null)[]): Set<UnitTypeIndex> {
  const seen = new Set<UnitTypeIndex>();
  const duplicates = new Set<UnitTypeIndex>();
  for (const s of slots) {
    if (s !== null) {
      if (seen.has(s)) {
        duplicates.add(s);
      }
      seen.add(s);
    }
  }
  return duplicates;
}

function getFleetSetup(): FleetSetup {
  const productionSlots = slots$.value.map((typeIdx) => {
    if (typeIdx === null) {
      return null;
    }
    const cs = TYPES[typeIdx]?.clusterSize ?? 1;
    return createProductionSlot(typeIdx, cs);
  });
  return { variant: variant$.value, slots: productionSlots };
}

export function resetComposeCounts() {
  slots$.value = Array.from({ length: SLOT_COUNT }, () => null);
  variant$.value = 0;
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetComposeCounts();
}

function EnemyFleetHeader() {
  const setup = composeEnemySetup$.value;
  const archName = composeEnemyArchName$.value;

  const variantDef = setup ? MOTHERSHIP_VARIANTS[setup.variant] : null;

  return (
    <div class={styles.header}>
      <h2 class={styles.headerTitle}>ENEMY FLEET</h2>
      <div class={styles.enemyList}>
        <div class={styles.enemyArch}>
          {archName}
          {variantDef && <span class={styles.enemyVariant}> / {variantDef.name}</span>}
        </div>
        <div class={styles.enemyUnits}>
          {setup?.slots.map((slot, i) => {
            if (!slot) {
              return null;
            }
            const t = TYPES[slot.type];
            if (!t) {
              return null;
            }
            return (
              <span key={i} class={styles.enemyUnit}>
                <span class={`${styles.dot} ${styles.dotTeam1}`} />
                {`${t.name} x${slot.count}`}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VariantSelector() {
  const current = variant$.value;

  return (
    <div class={styles.variantSection}>
      <div class={styles.variantTitle}>MOTHERSHIP VARIANT</div>
      <div class={styles.variantGrid}>
        {MOTHERSHIP_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            class={`${styles.variantCard} ${current === v.id ? styles.variantActive : ''}`}
            onClick={() => {
              variant$.value = v.id;
            }}
          >
            <div class={styles.variantName}>{v.name}</div>
            <div class={styles.variantDesc}>{v.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

type SlotCardProps = {
  readonly slotIndex: number;
  readonly typeIdx: UnitTypeIndex | null;
  readonly isDuplicate: boolean;
  readonly onSelect: (slotIndex: number, typeIdx: UnitTypeIndex | null) => void;
};

function SlotCard({ slotIndex, typeIdx, isDuplicate, onSelect }: SlotCardProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const t = typeIdx !== null ? TYPES[typeIdx] : null;
  const variantMul = getVariantDef(variant$.value).productionRateMul;

  const handleChange = () => {
    const el = selectRef.current;
    if (!el) {
      return;
    }
    const val = el.value;
    if (val === '') {
      onSelect(slotIndex, null);
      return;
    }
    const idx = Number(val);
    if (
      Number.isNaN(idx) ||
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= TYPES.length ||
      !isPurchasable(unitTypeIdx(idx))
    ) {
      return;
    }
    onSelect(slotIndex, unitTypeIdx(idx));
  };

  return (
    <div class={`${styles.slotCard} ${t ? styles.slotFilled : ''}`}>
      <div class={styles.slotLabel}>SLOT {slotIndex + 1}</div>
      {t && typeIdx !== null && (
        <div class={styles.slotInfo}>
          <div class={styles.slotName}>
            <span class={`${styles.dot} ${styles.dotTeam0}`} />
            {t.name}
            {isDuplicate && <span class={styles.slotDuplicate}>並行生産</span>}
          </div>
          <div class={styles.slotStats}>
            {t.clusterSize}機 / {getProductionTime(typeIdx, variantMul).toFixed(1)}秒
          </div>
        </div>
      )}
      {!t && <div class={styles.slotEmpty}>(空)</div>}
      <select
        ref={selectRef}
        class={styles.slotSelect}
        value={typeIdx !== null ? String(typeIdx) : ''}
        onChange={handleChange}
      >
        <option value="">-- 選択 --</option>
        {(['attack', 'support', 'special'] as const).map((role) => (
          <optgroup key={role} label={ROLE_LABELS[role]}>
            {PURCHASABLE_BY_ROLE[role].map((idx) => {
              const ut = TYPES[idx];
              if (!ut) {
                return null;
              }
              return (
                <option key={idx} value={String(idx)}>
                  {ut.name} ({ut.clusterSize}機/{getProductionTime(idx, variantMul).toFixed(1)}秒)
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

type FleetComposeProps = {
  readonly onLaunch: (setup: FleetSetup) => void;
  readonly onBack: () => void;
  readonly onCodexToggle: () => void;
};

export function FleetCompose({ onLaunch, onBack, onCodexToggle }: FleetComposeProps) {
  const currentSlots = slots$.value;
  const hasSlotSelected = currentSlots.some((s) => s !== null);
  const runInfo = getRunInfo();

  const duplicateSet = findDuplicateTypes(currentSlots);

  const handleSlotSelect = (slotIndex: number, typeIdx: UnitTypeIndex | null) => {
    const arr = [...slots$.value];
    arr[slotIndex] = typeIdx;
    slots$.value = arr;
  };

  const handleLaunch = () => {
    if (hasSlotSelected) {
      onLaunch(getFleetSetup());
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
        <VariantSelector />
        <div class={styles.body}>
          <div class={styles.productionHeader}>
            <span>PRODUCTION LINE</span>
          </div>
          <div class={styles.slotGrid} style={{ '--slot-count': String(SLOT_COUNT) }}>
            {Array.from({ length: SLOT_COUNT }, (_, i) => i).map((i) => {
              const typeIdx = currentSlots[i] ?? null;
              return (
                <SlotCard
                  key={i}
                  slotIndex={i}
                  typeIdx={typeIdx}
                  isDuplicate={typeIdx !== null && duplicateSet.has(typeIdx)}
                  onSelect={handleSlotSelect}
                />
              );
            })}
          </div>
        </div>
        <div class={styles.actions}>
          <button type="button" class={btnStyles.btn} onClick={onBack}>
            BACK
          </button>
          <button type="button" class={`${btnStyles.btn} ${styles.reset}`} onClick={handleReset}>
            RESET
          </button>
          <button
            type="button"
            class={`${btnStyles.btn} ${styles.launch}`}
            disabled={!hasSlotSelected}
            onClick={handleLaunch}
          >
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
