import { Coins, Lock, Plus, RefreshCw, Unlock } from 'lucide-preact';
import type { ShopItem } from '../../shop-tiers.ts';
import { REROLL_COST } from '../../shop-tiers.ts';
import { ROLE_LABELS } from '../../unit-type-accessors.ts';
import { TYPES } from '../../unit-types.ts';
import { shopCredits$, shopOfferings$ } from '../signals.ts';
import styles from './ShopPanel.module.css';

type ShopCardProps = {
  readonly item: ShopItem;
  readonly index: number;
  readonly canAfford: boolean;
  readonly onBuy: (idx: number) => void;
  readonly onToggleLock: (idx: number) => void;
};

function ShopCard({ item, index, canAfford, onBuy, onToggleLock }: ShopCardProps) {
  const t = TYPES[item.type];
  if (!t) {
    return null;
  }

  return (
    <div class={`${styles.shopCard} ${canAfford ? '' : styles.shopCardDisabled}`}>
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
        <span>{item.shopPrice}</span>
      </div>
      <button type="button" class={styles.buyBtn} disabled={!canAfford} onClick={() => onBuy(index)}>
        <Plus size={12} />
        購入
      </button>
    </div>
  );
}

type ShopPanelProps = {
  readonly onBuy: (idx: number) => void;
  readonly onToggleLock: (idx: number) => void;
  readonly onReroll: () => void;
};

export function ShopPanel({ onBuy, onToggleLock, onReroll }: ShopPanelProps) {
  const offerings = shopOfferings$.value;
  const credits = shopCredits$.value;
  const canReroll = credits >= REROLL_COST;

  return (
    <div class={styles.shopSection}>
      <div class={styles.shopHeader}>
        <span>SHOP</span>
        <button type="button" class={styles.rerollBtn} disabled={!canReroll} onClick={onReroll}>
          <RefreshCw size={12} />
          REROLL ({REROLL_COST} CR)
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
          return (
            <ShopCard
              key={`${item.type}-${i}`}
              item={item}
              index={i}
              canAfford={credits >= item.shopPrice}
              onBuy={onBuy}
              onToggleLock={onToggleLock}
            />
          );
        })}
      </div>
    </div>
  );
}
