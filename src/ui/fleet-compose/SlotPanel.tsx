import { Layers, Trash2 } from 'lucide-preact';
import { getMothershipDef } from '../../mothership-defs.ts';
import { getProductionTime } from '../../production-config.ts';
import type { ShopSlot } from '../../shop-tiers.ts';
import { mergeExpToLevel, sellPrice, spawnCount } from '../../shop-tiers.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { TYPES } from '../../unit-types.ts';
import { shopSlots$ } from '../signals.ts';
import styles from './SlotPanel.module.css';

type SlotCardProps = {
  readonly slotIndex: number;
  readonly slot: ShopSlot | null;
  readonly mothershipType: UnitTypeIndex;
  readonly onSell: (idx: number) => void;
};

function SlotCard({ slotIndex, slot, mothershipType, onSell }: SlotCardProps) {
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

  return (
    <div class={`${styles.slotCard} ${styles.slotFilled}`}>
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
          {count}機 / {getProductionTime(slot.type, productionTimeMul).toFixed(1)}秒
        </div>
      </div>
      <button type="button" class={styles.sellBtn} onClick={() => onSell(slotIndex)}>
        <Trash2 size={11} />
        売却 ({sellPrice(slot.mergeExp)}Cr)
      </button>
    </div>
  );
}

type SlotPanelProps = {
  readonly mothershipType: UnitTypeIndex;
  readonly onSell: (idx: number) => void;
};

export function SlotPanel({ mothershipType, onSell }: SlotPanelProps) {
  const slots = shopSlots$.value;

  return (
    <div class={styles.body}>
      <div class={styles.productionHeader}>
        <span>YOUR FLEET</span>
      </div>
      <div class={styles.slotGrid} style={{ '--slot-count': String(slots.length) }}>
        {slots.map((slot, i) => (
          <SlotCard key={i} slotIndex={i} slot={slot} mothershipType={mothershipType} onSell={onSell} />
        ))}
      </div>
    </div>
  );
}
