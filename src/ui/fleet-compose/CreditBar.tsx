import { Coins } from 'lucide-preact';
import { ROUND_CREDITS } from '../../shop-tiers.ts';
import { shopCredits$ } from '../signals.ts';
import styles from './CreditBar.module.css';

export function CreditBar() {
  const credits = shopCredits$.value;
  const pct = Math.min(100, Math.round((credits / ROUND_CREDITS) * 100));

  return (
    <div class={styles.creditBar}>
      <Coins size={14} />
      <span class={styles.creditValue}>{credits} CR</span>
      <div class={styles.creditGauge}>
        <div class={styles.creditFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
