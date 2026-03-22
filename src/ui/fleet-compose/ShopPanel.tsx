import { Coins, Lock, Plus, RefreshCw, Unlock } from 'lucide-preact';
import type { PurchaseBlock, PurchaseCheck, ShopItem } from '../../shop-tiers.ts';
import { REROLL_COST, SHOP_PRICE } from '../../shop-tiers.ts';
import { ROLE_LABELS } from '../../unit-type-accessors.ts';
import { TYPES } from '../../unit-types.ts';
import { shopCredits$, shopFreeRerolls$, shopOfferings$, shopPurchaseBlocks$ } from '../signals.ts';
import { REROLL_OUT_MS, SHRINK_OUT_MS } from './anim-timing.ts';
import styles from './ShopPanel.module.css';

const BLOCK_LABELS: Record<PurchaseBlock, string> = {
  no_credits: '不足',
  max_star: '★3到達',
  slots_full: '満杯',
  sold_out: '売切',
};

function buyLabel(check: PurchaseCheck): string {
  switch (check) {
    case 'ok':
    case 'no_credits':
      return '購入';
    case 'max_star':
    case 'slots_full':
    case 'sold_out':
      return BLOCK_LABELS[check];
  }
}

type ShopCardProps = {
  readonly item: ShopItem;
  readonly index: number;
  readonly blocked: PurchaseCheck;
  readonly animating: 'shrink-out' | 'reroll-out' | null;
  readonly onBuy: (idx: number) => void;
  readonly onToggleLock: (idx: number) => void;
};

function ShopCard({ item, index, blocked, animating, onBuy, onToggleLock }: ShopCardProps) {
  const t = TYPES[item.type];
  if (!t) {
    return null;
  }

  let cardClass = styles.shopCard;
  if (blocked !== 'ok') {
    cardClass += ` ${styles.shopCardDisabled}`;
  }
  if (animating === 'shrink-out') {
    cardClass += ` ${styles.shrinkOut}`;
  }
  if (animating === 'reroll-out') {
    cardClass += ` ${styles.rerollOut}`;
  }

  const animDurMap = { 'shrink-out': SHRINK_OUT_MS, 'reroll-out': REROLL_OUT_MS } as const;
  const animDur = animating ? animDurMap[animating] : undefined;

  return (
    <div class={cardClass} style={animDur != null ? { '--anim-dur': `${animDur}ms` } : undefined}>
      <button
        type="button"
        class={styles.lockBtn}
        onClick={() => onToggleLock(index)}
        title={item.locked ? '解除' : 'ロック'}
      >
        {item.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
      <div class={styles.shopName}>{t.name}</div>
      <div class={styles.shopRole}>{ROLE_LABELS[t.role]}</div>
      <div class={styles.shopCluster}>{t.clusterSize}機</div>
      <div class={styles.shopPrice}>
        <Coins size={11} />
        <span>{SHOP_PRICE}</span>
      </div>
      <button type="button" class={styles.buyBtn} disabled={blocked !== 'ok'} onClick={() => onBuy(index)}>
        <Plus size={12} />
        {buyLabel(blocked)}
      </button>
    </div>
  );
}

function resolveCardAnim(
  i: number,
  item: ShopItem,
  buyAnimIdx: number | null,
  rerolling: boolean,
): 'shrink-out' | 'reroll-out' | null {
  if (buyAnimIdx === i) {
    return 'shrink-out';
  }
  if (rerolling && !item.locked) {
    return 'reroll-out';
  }
  return null;
}

type ShopPanelProps = {
  readonly onBuy: (idx: number) => void;
  readonly onToggleLock: (idx: number) => void;
  readonly onReroll: () => void;
  readonly buyAnimIdx: number | null;
  readonly rerolling: boolean;
  readonly generation: number;
};

export function ShopPanel({ onBuy, onToggleLock, onReroll, buyAnimIdx, rerolling, generation }: ShopPanelProps) {
  const offerings = shopOfferings$.value;
  const credits = shopCredits$.value;
  const freeRerolls = shopFreeRerolls$.value;
  const blocks = shopPurchaseBlocks$.value;
  const canReroll = freeRerolls > 0 || credits >= REROLL_COST;

  return (
    <div class={styles.shopSection}>
      <div class={styles.shopHeader}>
        <span>SHOP</span>
        <button type="button" class={styles.rerollBtn} disabled={!canReroll} onClick={onReroll}>
          <RefreshCw size={12} />
          {freeRerolls > 0 ? `FREE REROLL (${freeRerolls})` : `REROLL (${REROLL_COST} CR)`}
        </button>
      </div>
      <div class={styles.shopGrid}>
        {offerings.map((item, i) => {
          if (!item) {
            return (
              <div key={`empty-${i}`} class={`${styles.shopCard} ${styles.shopCardEmpty}`}>
                <div class={styles.shopEmpty}>SOLD</div>
              </div>
            );
          }

          const anim = resolveCardAnim(i, item, buyAnimIdx, rerolling);

          return (
            <ShopCard
              key={`${generation}-${item.type}-${i}`}
              item={item}
              index={i}
              blocked={blocks[i] ?? 'sold_out'}
              animating={anim}
              onBuy={onBuy}
              onToggleLock={onToggleLock}
            />
          );
        })}
      </div>
    </div>
  );
}
