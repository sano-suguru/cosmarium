import { signal } from '@preact/signals';
import { BookOpen, ShieldAlert, Swords } from 'lucide-preact';
import { useEffect } from 'preact/hooks';
import { ASCENSION_MERGE_THRESHOLD, getMothershipDef } from '../../mothership-defs.ts';
import { getRunInfo } from '../../run.ts';
import type { BuyTarget } from '../../shop.ts';
import {
  calculateSellCredit,
  findBuyTarget,
  purchaseItem,
  purchaseModule,
  rerollOfferings,
  sellSlot,
  toggleLock,
  toggleModuleLock,
} from '../../shop.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { NO_MODULE } from '../../types.ts';
import type { RoundType } from '../../types-fleet.ts';
import { ASCENSION_TYPE } from '../../unit-type-accessors.ts';
import { createAnimSlot } from '../anim-guard.ts';
import btnStyles from '../shared/button.module.css';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import { composeEnemyArchName$, composeEnemySetup$, runMergeCount$, shopOfferings$, shopSlots$ } from '../signals.ts';
import { FLOAT_CREDIT_MS, MERGE_FLASH_MS, PULSE_IN_MS, REROLL_OUT_MS, SHRINK_OUT_MS } from './anim-timing.ts';
import { CreditBar } from './CreditBar.tsx';
import styles from './FleetCompose.module.css';
import { RetireButton } from './RetireButton.tsx';
import { ShopPanel } from './ShopPanel.tsx';
import { SlotPanel } from './SlotPanel.tsx';

type BuyOutAnim = { offeringIdx: number; target: BuyTarget };
type BuyInAnim = { slotIdx: number; isMerge: boolean };
type SellAnim = { slotIdx: number };
type FloatCredit = { slotIdx: number; amount: number };

function noop() {
  /* intentional no-op for animation commit callbacks */
}

const buyOutAnim = createAnimSlot<BuyOutAnim | null>(null);
const buyInAnim = createAnimSlot<BuyInAnim | null>(null);
const sellAnim = createAnimSlot<SellAnim | null>(null);
const floatCreditAnim = createAnimSlot<FloatCredit | null>(null);
const rerollAnim = createAnimSlot<boolean>(false);
const creditPulse$ = signal<'spend' | 'gain' | null>(null);
/** モジュール装着待ち: 選択中のモジュール offering index */
const equipMode$ = signal<number | null>(null);

/** アニメーション再生中判定 */
function isAnimating(): boolean {
  return (
    buyOutAnim.$.value !== null ||
    buyInAnim.$.value !== null ||
    sellAnim.$.value !== null ||
    rerollAnim.$.value !== false
  );
}

/**
 * 排他的操作ロック判定 — アニメーション再生中 or モジュール装着選択中。
 * モジュール選択の切り替え自体はここでブロックせず isAnimating() を使う。
 */
function isExclusiveLocked(): boolean {
  return isAnimating() || equipMode$.value !== null;
}

function launchLabel(rt: RoundType | undefined): string {
  switch (rt) {
    case 'ffa':
      return 'LAUNCH FFA';
    case 'bonus':
      return 'LAUNCH BONUS';
    case 'boss':
      return 'LAUNCH BOSS';
    case 'pve':
      return 'LAUNCH';
    case 'battle':
    case undefined:
      return 'LAUNCH BATTLE';
    default: {
      const _: never = rt;
      throw new Error(`Unknown roundType: ${_ as string}`);
    }
  }
}

const shopGeneration$ = signal(0);

/** テスト専用: モジュールレベル変数をリセット */
export function _resetFleetCompose() {
  buyOutAnim.cancel();
  buyInAnim.cancel();
  sellAnim.cancel();
  floatCreditAnim.cancel();
  rerollAnim.cancel();
  creditPulse$.value = null;
  equipMode$.value = null;
  shopGeneration$.value = 0;
}

function AscensionProgress({ mothershipType }: { readonly mothershipType: UnitTypeIndex }) {
  if (mothershipType !== ASCENSION_TYPE) {
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
  const isPve = runInfo?.roundType === 'pve';

  const msDef = !isFfa && !isBonus && setup ? getMothershipDef(setup.mothershipType) : null;
  const slotCount = setup?.slots.filter((s) => s !== null).length ?? 0;

  let headerLabel = 'ENEMY FLEET';
  if (isPve) {
    headerLabel = 'NPC ROUND';
  } else if (isFfa) {
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
  readonly mothershipType: UnitTypeIndex;
  readonly onLaunch: () => void;
  readonly onRetire: () => void;
  readonly onCodexToggle: () => void;
};

export function FleetCompose({ mothershipType, onLaunch, onRetire, onCodexToggle }: FleetComposeProps) {
  const runInfo = getRunInfo();
  const hasSlotFilled = shopSlots$.value.some((s) => s !== null);
  const inEquipMode = equipMode$.value !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && equipMode$.value !== null) {
        equipMode$.value = null;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const cancelEquip = () => {
    equipMode$.value = null;
  };

  const handleLaunch = () => {
    if (hasSlotFilled) {
      onLaunch();
    }
  };

  const handleBuy = (offeringIdx: number) => {
    if (isExclusiveLocked()) {
      return;
    }

    const offerings = shopOfferings$.value;
    const item = offerings[offeringIdx];
    if (!item) {
      return;
    }

    const target = findBuyTarget(item.type);
    creditPulse$.value = 'spend';
    buyOutAnim.start(
      { offeringIdx, target },
      () => {
        if (!purchaseItem(offeringIdx, target)) {
          return;
        }
        buyInAnim.start(
          { slotIdx: target.idx, isMerge: target.isMerge },
          noop,
          target.isMerge ? MERGE_FLASH_MS : PULSE_IN_MS,
        );
      },
      SHRINK_OUT_MS,
    );
  };

  const handleSell = (slotIdx: number) => {
    if (isExclusiveLocked()) {
      return;
    }

    const slots = shopSlots$.value;
    const slot = slots[slotIdx];
    if (!slot) {
      return;
    }

    const creditGain = calculateSellCredit(slot.mergeExp, slot.moduleId !== NO_MODULE);
    creditPulse$.value = 'gain';
    floatCreditAnim.start({ slotIdx, amount: creditGain }, noop, FLOAT_CREDIT_MS);
    sellAnim.start(
      { slotIdx },
      () => {
        sellSlot(slotIdx);
      },
      SHRINK_OUT_MS,
    );
  };

  const handleBuyModule = (offeringIdx: number) => {
    if (isAnimating()) {
      return;
    }
    // 装着先選択モードに入る（equipMode 中の切り替えは意図的に許可）
    equipMode$.value = offeringIdx;
  };

  const handleSlotClickForEquip = (slotIdx: number) => {
    const modIdx = equipMode$.value;
    if (modIdx === null) {
      return;
    }
    equipMode$.value = null;
    if (purchaseModule(modIdx, slotIdx)) {
      creditPulse$.value = 'spend';
    }
  };

  const handleReroll = () => {
    if (isExclusiveLocked()) {
      return;
    }
    creditPulse$.value = 'spend';
    rerollAnim.start(
      true,
      () => {
        rerollOfferings();
        shopGeneration$.value++;
      },
      REROLL_OUT_MS,
    );
  };

  const buyOutVal = buyOutAnim.$.value;
  const buyInVal = buyInAnim.$.value;
  const sellAnimVal = sellAnim.$.value;
  const floatCreditVal = floatCreditAnim.$.value;

  return (
    <>
      <RetireButton onRetire={onRetire} />
      <div class={styles.compose}>
        {runInfo && <RunInfoBar info={runInfo} class={styles.roundInfo} livesClass={styles.lives} />}
        <CreditBar
          pulse={creditPulse$.value}
          onPulseEnd={() => {
            creditPulse$.value = null;
          }}
        />
        <EnemyFleetHeader />
        <ShopPanel
          onBuy={handleBuy}
          onToggleLock={toggleLock}
          onBuyModule={handleBuyModule}
          onToggleModuleLock={toggleModuleLock}
          onReroll={handleReroll}
          buyAnimIdx={buyOutVal ? buyOutVal.offeringIdx : null}
          rerolling={rerollAnim.$.value}
          generation={shopGeneration$.value}
          locked={inEquipMode}
        />
        <SlotPanel
          mothershipType={mothershipType}
          getSellCredit={calculateSellCredit}
          onSell={handleSell}
          onSlotClick={handleSlotClickForEquip}
          buyInSlotIdx={buyInVal ? buyInVal.slotIdx : null}
          buyInIsMerge={buyInVal ? buyInVal.isMerge : false}
          sellAnimSlotIdx={sellAnimVal ? sellAnimVal.slotIdx : null}
          floatCreditSlotIdx={floatCreditVal ? floatCreditVal.slotIdx : null}
          floatCreditAmount={floatCreditVal ? floatCreditVal.amount : 0}
          equipMode={inEquipMode}
          onCancelEquip={cancelEquip}
        />
        <AscensionProgress mothershipType={mothershipType} />
        <div class={styles.actions}>
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
