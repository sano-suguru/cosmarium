import { signal } from '@preact/signals';
import { ArrowLeft, BookOpen, RotateCcw, ShieldAlert, Swords } from 'lucide-preact';
import { MOTHERSHIP_VARIANTS } from '../../mothership-variants.ts';
import { getRunInfo } from '../../run.ts';
import { purchaseItem, rerollOfferings, sellSlot, toggleLock } from '../../shop.ts';
import type { MothershipVariant, RoundType } from '../../types-fleet.ts';
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

const variant$ = signal<MothershipVariant>(0);

export function resetVariant() {
  variant$.value = 0;
}

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  resetVariant();
}

function EnemyFleetHeader() {
  const setup = composeEnemySetup$.value;
  const archName = composeEnemyArchName$.value;
  const runInfo = getRunInfo();
  const isFfa = runInfo?.roundType === 'ffa';
  const isBonus = runInfo?.roundType === 'bonus';

  const variantDef = !isFfa && !isBonus && setup ? MOTHERSHIP_VARIANTS[setup.variant] : null;
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
          {variantDef && <span class={styles.enemyVariant}> / {variantDef.name}</span>}
        </div>
        <div class={styles.enemyUnits}>
          {slotCount > 0 && <span class={styles.enemyIntel}>{slotCount} 部隊 (詳細不明)</span>}
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

type FleetComposeProps = {
  readonly onLaunch: (variant: MothershipVariant) => void;
  readonly onBack: () => void;
  readonly onCodexToggle: () => void;
};

export function FleetCompose({ onLaunch, onBack, onCodexToggle }: FleetComposeProps) {
  const runInfo = getRunInfo();
  const hasSlotFilled = shopSlots$.value.some((s) => s !== null);

  const handleLaunch = () => {
    if (hasSlotFilled) {
      onLaunch(variant$.value);
    }
  };

  return (
    <>
      <div class={styles.compose}>
        {runInfo && <RunInfoBar info={runInfo} class={styles.roundInfo} livesClass={styles.lives} />}
        <CreditBar />
        <EnemyFleetHeader />
        <VariantSelector />
        <ShopPanel onBuy={purchaseItem} onToggleLock={toggleLock} onReroll={rerollOfferings} />
        <SlotPanel variant={variant$.value} onSell={sellSlot} />
        <div class={styles.actions}>
          <button type="button" class={btnStyles.btn} onClick={onBack}>
            <ArrowLeft size={14} /> BACK
          </button>
          <button
            type="button"
            class={`${btnStyles.btn} ${styles.reset}`}
            onClick={() => {
              resetVariant();
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
