import { signal } from '@preact/signals';
import { ArrowLeft, BookOpen, RotateCcw, ShieldAlert, Swords } from 'lucide-preact';
import { getMothershipDef, MOTHERSHIP_DEFS } from '../../mothership-defs.ts';
import { getRunInfo } from '../../run.ts';
import { purchaseItem, rerollOfferings, sellSlot, toggleLock } from '../../shop.ts';
import type { UnitTypeIndex } from '../../types.ts';
import type { RoundType } from '../../types-fleet.ts';
import { HIVE_TYPE } from '../../unit-type-accessors.ts';
import { resetCurrentRoundShop } from '../game-control.ts';
import btnStyles from '../shared/button.module.css';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { composeEnemyArchName$, composeEnemySetup$, shopSlots$ } from '../signals.ts';
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
  return 'LAUNCH BATTLE';
}

const mothershipType$ = signal<UnitTypeIndex>(HIVE_TYPE);

export function resetMothershipType() {
  mothershipType$.value = HIVE_TYPE;
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetMothershipType();
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

function MothershipSelector() {
  const current = mothershipType$.value;

  return (
    <div class={styles.mothershipSection}>
      <div class={styles.mothershipTitle}>MOTHERSHIP</div>
      <div class={styles.mothershipGrid}>
        {MOTHERSHIP_DEFS.map((d) => (
          <button
            key={d.type}
            type="button"
            class={`${styles.mothershipCard} ${current === d.type ? styles.mothershipActive : ''}`}
            onClick={() => {
              mothershipType$.value = d.type;
            }}
          >
            <div class={styles.mothershipName}>{d.name}</div>
            <div class={styles.mothershipDesc}>{d.description}</div>
          </button>
        ))}
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
        <MothershipSelector />
        <ShopPanel onBuy={purchaseItem} onToggleLock={toggleLock} onReroll={rerollOfferings} />
        <SlotPanel mothershipType={mothershipType$.value} onSell={sellSlot} />
        <div class={styles.actions}>
          <button type="button" class={btnStyles.btn} onClick={onBack}>
            <ArrowLeft size={14} /> BACK
          </button>
          <button
            type="button"
            class={`${btnStyles.btn} ${styles.reset}`}
            onClick={() => {
              resetMothershipType();
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
