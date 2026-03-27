import { Layers, Trash2, Zap } from 'lucide-preact';
import { mergeExpToLevel } from '../../merge-config.ts';
import { moduleDef } from '../../module-defs.ts';
import { getMothershipDef } from '../../mothership-defs.ts';
import { getProductionTime } from '../../production-config.ts';
import type { ShopSlot } from '../../shop-tiers.ts';
import { spawnCount } from '../../shop-tiers.ts';
import type { UnitTypeIndex } from '../../types.ts';
import { NO_MODULE } from '../../types.ts';
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
  readonly equipMode: boolean;
  readonly getSellCredit: (mergeExp: number, hasModule: boolean) => number;
  readonly onSell: (idx: number) => void;
  readonly onSlotClick: (idx: number) => void;
};

const ANIM_DUR_MAP = {
  'pulse-in': PULSE_IN_MS,
  'merge-flash': MERGE_FLASH_MS,
  'shrink-out': SHRINK_OUT_MS,
} as const;

function animClass(animState: SlotCardProps['animState']): string | undefined {
  switch (animState) {
    case 'pulse-in':
      return styles.pulseIn;
    case 'merge-flash':
      return styles.mergeFlash;
    case 'shrink-out':
      return styles.shrinkOut;
    case null:
      return undefined;
  }
}

function buildCardClass(animState: SlotCardProps['animState'], equipMode: boolean, hasModule: boolean): string {
  let cls = `${styles.slotCard} ${styles.slotFilled}`;
  const ac = animClass(animState);
  if (ac) {
    cls += ` ${ac}`;
  }
  if (equipMode) {
    cls += hasModule ? ` ${styles.equipReplace}` : ` ${styles.equipTarget}`;
  }
  return cls;
}

function EmptySlotCard({ slotIndex }: { readonly slotIndex: number }) {
  return (
    <div class={styles.slotCard}>
      <div class={styles.slotLabel}>SLOT {slotIndex + 1}</div>
      <div class={styles.slotEmpty}>(空)</div>
    </div>
  );
}

function SlotCard({
  slotIndex,
  slot,
  mothershipType,
  animState,
  floatCredit,
  equipMode,
  getSellCredit,
  onSell,
  onSlotClick,
}: SlotCardProps) {
  if (!slot) {
    return <EmptySlotCard slotIndex={slotIndex} />;
  }

  const t = TYPES[slot.type];
  if (!t) {
    return null;
  }

  const { productionTimeMul, spawnCountMul } = getMothershipDef(mothershipType);
  const count = spawnCount(slot, spawnCountMul);
  const mergeLevel = mergeExpToLevel(slot.mergeExp);
  const hasModule = slot.moduleId !== NO_MODULE;
  const cardClass = buildCardClass(animState, equipMode, hasModule);
  const slotAnimDur = animState ? ANIM_DUR_MAP[animState] : undefined;

  return (
    <div class={styles.slotWrapper}>
      <div
        class={cardClass}
        style={slotAnimDur != null ? { '--anim-dur': `${slotAnimDur}ms` } : undefined}
        {...(equipMode
          ? {
              role: 'button',
              tabIndex: 0,
              onClick: () => onSlotClick(slotIndex),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSlotClick(slotIndex);
                }
              },
            }
          : {})}
      >
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
          {hasModule && (
            <div class={styles.moduleBadge}>
              <Zap size={10} /> {moduleDef(slot.moduleId).name}
            </div>
          )}
        </div>
        {!equipMode && (
          <button type="button" class={styles.sellBtn} onClick={() => onSell(slotIndex)}>
            <Trash2 size={11} />
            売却 ({getSellCredit(slot.mergeExp, hasModule)}Cr)
          </button>
        )}
      </div>
      {floatCredit > 0 && (
        <div class={styles.floatCredit} style={{ '--anim-dur': `${FLOAT_CREDIT_MS}ms` }}>
          +{floatCredit}Cr
        </div>
      )}
    </div>
  );
}

function resolveSlotAnim(
  i: number,
  buyInSlotIdx: number | null,
  buyInIsMerge: boolean,
  sellAnimSlotIdx: number | null,
): 'pulse-in' | 'merge-flash' | 'shrink-out' | null {
  if (buyInSlotIdx === i && !buyInIsMerge) {
    return 'pulse-in';
  }
  if (buyInSlotIdx === i && buyInIsMerge) {
    return 'merge-flash';
  }
  if (sellAnimSlotIdx === i) {
    return 'shrink-out';
  }
  return null;
}

type SlotPanelProps = {
  readonly mothershipType: UnitTypeIndex;
  readonly getSellCredit: (mergeExp: number, hasModule: boolean) => number;
  readonly onSell: (idx: number) => void;
  readonly onSlotClick: (idx: number) => void;
  readonly onCancelEquip: () => void;
  readonly buyInSlotIdx: number | null;
  readonly buyInIsMerge: boolean;
  readonly sellAnimSlotIdx: number | null;
  readonly floatCreditSlotIdx: number | null;
  readonly floatCreditAmount: number;
  readonly equipMode: boolean;
};

export function SlotPanel({
  mothershipType,
  getSellCredit,
  onSell,
  onSlotClick,
  onCancelEquip,
  buyInSlotIdx,
  buyInIsMerge,
  sellAnimSlotIdx,
  floatCreditSlotIdx,
  floatCreditAmount,
  equipMode,
}: SlotPanelProps) {
  const slots = shopSlots$.value;

  return (
    <div class={styles.body}>
      <div class={styles.productionHeader}>
        <span>{equipMode ? 'モジュール装着先を選択' : 'YOUR FLEET'}</span>
        {equipMode && (
          <button type="button" class={styles.cancelBtn} onClick={onCancelEquip}>
            キャンセル (ESC)
          </button>
        )}
      </div>
      <div class={styles.slotGrid} style={{ '--slot-count': String(slots.length) }}>
        {slots.map((slot, i) => (
          <SlotCard
            key={i}
            slotIndex={i}
            slot={slot}
            mothershipType={mothershipType}
            animState={resolveSlotAnim(i, buyInSlotIdx, buyInIsMerge, sellAnimSlotIdx)}
            floatCredit={floatCreditSlotIdx === i ? floatCreditAmount : 0}
            equipMode={equipMode && slot !== null}
            getSellCredit={getSellCredit}
            onSell={onSell}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}
