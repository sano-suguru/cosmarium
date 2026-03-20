import { signal } from '@preact/signals';
import { ArrowLeft, BookOpen, RotateCcw, ShieldAlert, Swords } from 'lucide-preact';
import { ASCENSION_MERGE_THRESHOLD, getMothershipDef } from '../../mothership-defs.ts';
import { getRunInfo } from '../../run.ts';
import { purchaseItem, rerollOfferings, sellSlot, toggleLock } from '../../shop.ts';
import type { UnitTypeIndex } from '../../types.ts';
import type { RoundType } from '../../types-fleet.ts';
import { ASCENSION_TYPE, HIVE_TYPE } from '../../unit-type-accessors.ts';
import { resetCurrentRoundShop } from '../game-control.ts';
import btnStyles from '../shared/button.module.css';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { composeEnemyArchName$, composeEnemySetup$, runMergeCount$, shopSlots$ } from '../signals.ts';
import { CreditBar } from './CreditBar.tsx';
import styles from './FleetCompose.module.css';
import { ShopPanel } from './ShopPanel.tsx';
import { SlotPanel } from './SlotPanel.tsx';

function launchLabel(rt: RoundType | undefined): string {
  if (rt === 'ffa') {
    return 'LAUNCH FFA';
  }
  if (rt === 'bonus') {
    return 'LAUNCH BONUS';
  }
  if (rt === 'boss') {
    return 'LAUNCH BOSS';
  }
  return 'LAUNCH BATTLE';
}

const mothershipType$ = signal<UnitTypeIndex>(HIVE_TYPE);

export function resetMothershipType() {
  mothershipType$.value = HIVE_TYPE;
}

export function getSelectedMothershipType(): UnitTypeIndex {
  return mothershipType$.value;
}

export function setMothershipType(type: UnitTypeIndex) {
  mothershipType$.value = type;
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetMothershipType();
}

function AscensionProgress() {
  if (mothershipType$.value !== ASCENSION_TYPE) {
    return null;
  }
  const merges = runMergeCount$.value;
  const awakened = merges >= ASCENSION_MERGE_THRESHOLD;
  const pct = Math.min(100, (merges / ASCENSION_MERGE_THRESHOLD) * 100);
  return (
    <div class={styles.ascensionStatus}>
      {awakened ? (
        <span class={styles.ascensionAwakened}>覚醒済み — HP+30% DMG+20%</span>
      ) : (
        <span>
          覚醒進捗: {merges}/{ASCENSION_MERGE_THRESHOLD} マージ ({Math.floor(pct)}%)
        </span>
      )}
    </div>
  );
}

function EnemyFleetHeader() {
  const setup = composeEnemySetup$.value;
  const archName = composeEnemyArchName$.value;
  const runInfo = getRunInfo();
  const isFfa = runInfo?.roundType === 'ffa';
  const isBonus = runInfo?.roundType === 'bonus';

  const msDef = !isFfa && !isBonus && setup ? getMothershipDef(setup.mothershipType) : null;
  const slotCount = setup?.slots.filter((s) => s !== null).length ?? 0;

  let headerLabel = 'ENEMY FLEET';
  if (isFfa) {
    headerLabel = 'SPECIAL ROUND';
  } else if (isBonus) {
    headerLabel = 'BONUS ROUND';
  }

  return (
    <div class={styles.header}>
      <h2 class={styles.headerTitle}>
        <ShieldAlert size={16} /> {headerLabel}
      </h2>
      <div class={styles.enemyList}>
        <div class={styles.enemyArch}>
          {archName}
          {msDef && <span class={styles.enemyMothership}> / {msDef.name}</span>}
        </div>
        <div class={styles.enemyUnits}>
          {slotCount > 0 && <span class={styles.enemyIntel}>{slotCount} 部隊 (詳細不明)</span>}
        </div>
      </div>
    </div>
  );
}

type FleetComposeProps = {
  readonly onLaunch: (mothershipType: UnitTypeIndex) => void;
  readonly onBack: () => void;
  readonly onCodexToggle: () => void;
};

export function FleetCompose({ onLaunch, onBack, onCodexToggle }: FleetComposeProps) {
  const runInfo = getRunInfo();
  const hasSlotFilled = shopSlots$.value.some((s) => s !== null);

  const handleLaunch = () => {
    if (hasSlotFilled) {
      onLaunch(mothershipType$.value);
    }
  };

  return (
    <>
      <div class={styles.compose}>
        {runInfo && <RunInfoBar info={runInfo} class={styles.roundInfo} livesClass={styles.lives} />}
        <CreditBar />
        <EnemyFleetHeader />
        <ShopPanel onBuy={purchaseItem} onToggleLock={toggleLock} onReroll={rerollOfferings} />
        <SlotPanel mothershipType={mothershipType$.value} onSell={sellSlot} />
        <AscensionProgress />
        <div class={styles.actions}>
          <button type="button" class={btnStyles.btn} onClick={onBack}>
            <ArrowLeft size={14} /> BACK
          </button>
          <button
            type="button"
            class={`${btnStyles.btn} ${styles.reset}`}
            onClick={() => {
              resetCurrentRoundShop();
            }}
          >
            <RotateCcw size={14} /> RESET
          </button>
          <button
            type="button"
            class={`${btnStyles.btn} ${styles.launch}`}
            disabled={!hasSlotFilled}
            onClick={handleLaunch}
          >
            <Swords size={14} /> {launchLabel(runInfo?.roundType)}
          </button>
        </div>
      </div>
      <button type="button" class={styles.codexBtn} onClick={onCodexToggle}>
        <BookOpen size={12} /> TAB: CODEX
      </button>
    </>
  );
}
