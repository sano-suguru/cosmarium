import { Layers, Trash2 } from 'lucide-preact';
import { getMothershipDef } from '../../mothership-defs.ts';
import { getProductionTime } from '../../production-config.ts';
import type { ShopSlot } from '../../shop-tiers.ts';
import { mergeExpToLevel, sellPrice, spawnCount } from '../../shop-tiers.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { TYPES } from '../../unit-types.ts';
import { shopSlots$ } from '../signals.ts';
import { FLOAT_CREDIT_MS, MERGE_FLASH_MS, PULSE_IN_MS, SHRINK_OUT_MS } from './anim-timing.ts';
import styles from './SlotPanel.module.css';

type SlotCardProps = {
  readonly slotIndex: number;
  readonly slot: ShopSlot | null;
  readonly mothershipType: UnitTypeIndex;
  readonly animState: 'pulse-in' | 'merge-flash' | 'shrink-out' | null;
  readonly floatCredit: number;
  readonly onSell: (idx: number) => void;
};

function SlotCard({ slotIndex, slot, mothershipType, animState, floatCredit, onSell }: SlotCardProps) {
  if (!slot) {
    return (
      <div class={styles.slotCard}>
        <div class={styles.slotLabel}>SLOT {slotIndex + 1}</div>
        <div class={styles.slotEmpty}>(空)</div>
      </div>
    );
  }

  const t = TYPES[slot.type];
  if (!t) {
    return null;
  }

  const { productionTimeMul, spawnCountMul } = getMothershipDef(mothershipType);
  const count = spawnCount(slot, spawnCountMul);

  const mergeLevel = mergeExpToLevel(slot.mergeExp);

  let cardClass = `${styles.slotCard} ${styles.slotFilled}`;
  if (animState === 'pulse-in') {
    cardClass += ` ${styles.pulseIn}`;
  }
  if (animState === 'merge-flash') {
    cardClass += ` ${styles.mergeFlash}`;
  }
  if (animState === 'shrink-out') {
    cardClass += ` ${styles.shrinkOut}`;
  }

  const animDurMap = {
    'pulse-in': PULSE_IN_MS,
    'merge-flash': MERGE_FLASH_MS,
    'shrink-out': SHRINK_OUT_MS,
  } as const;
  const slotAnimDur = animState ? animDurMap[animState] : undefined;

  return (
    <div class={styles.slotWrapper}>
      <div class={cardClass} style={slotAnimDur != null ? { '--anim-dur': `${slotAnimDur}ms` } : undefined}>
        <div class={styles.slotLabel}>SLOT {slotIndex + 1}</div>
        <div class={styles.slotInfo}>
          <div class={styles.slotName}>
            <span class={`${styles.dot} ${styles.dotTeam0}`} />
            {t.name}
            {mergeLevel > 1 && (
              <span class={styles.mergeBadge}>
                <Layers size={10} />★{mergeLevel}
              </span>
            )}
          </div>
          <div class={styles.slotStats}>
            {count}機 / {getProductionTime(slot.type, productionTimeMul, slot.mergeExp).toFixed(1)}秒
          </div>
        </div>
        <button type="button" class={styles.sellBtn} onClick={() => onSell(slotIndex)}>
          <Trash2 size={11} />
          売却 ({sellPrice(slot.mergeExp)}Cr)
        </button>
      </div>
      {floatCredit > 0 && (
        <div class={styles.floatCredit} style={{ '--anim-dur': `${FLOAT_CREDIT_MS}ms` }}>
          +{floatCredit}Cr
        </div>
      )}
    </div>
  );
}

type SlotPanelProps = {
  readonly mothershipType: UnitTypeIndex;
  readonly onSell: (idx: number) => void;
  readonly buyInSlotIdx: number | null;
  readonly buyInIsMerge: boolean;
  readonly sellAnimSlotIdx: number | null;
  readonly floatCreditSlotIdx: number | null;
  readonly floatCreditAmount: number;
};

export function SlotPanel({
  mothershipType,
  onSell,
  buyInSlotIdx,
  buyInIsMerge,
  sellAnimSlotIdx,
  floatCreditSlotIdx,
  floatCreditAmount,
}: SlotPanelProps) {
  const slots = shopSlots$.value;

  return (
    <div class={styles.body}>
      <div class={styles.productionHeader}>
        <span>YOUR FLEET</span>
      </div>
      <div class={styles.slotGrid} style={{ '--slot-count': String(slots.length) }}>
        {slots.map((slot, i) => {
          let animState: 'pulse-in' | 'merge-flash' | 'shrink-out' | null = null;
          let floatCredit = 0;

          if (buyInSlotIdx === i && !buyInIsMerge) {
            animState = 'pulse-in';
          } else if (buyInSlotIdx === i && buyInIsMerge) {
            animState = 'merge-flash';
          } else if (sellAnimSlotIdx === i) {
            animState = 'shrink-out';
          }

          if (floatCreditSlotIdx === i) {
            floatCredit = floatCreditAmount;
          }

          return (
            <SlotCard
              key={i}
              slotIndex={i}
              slot={slot}
              mothershipType={mothershipType}
              animState={animState}
              floatCredit={floatCredit}
              onSell={onSell}
            />
          );
        })}
      </div>
    </div>
  );
}
