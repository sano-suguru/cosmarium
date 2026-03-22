import { Coins } from 'lucide-preact';
import { ROUND_CREDITS } from '../../shop-tiers.ts';
import { shopCredits$ } from '../signals.ts';
import styles from './CreditBar.module.css';

type CreditBarProps = {
  readonly pulse: 'spend' | 'gain' | null;
  readonly onPulseEnd: () => void;
};

export function CreditBar({ pulse, onPulseEnd }: CreditBarProps) {
  const credits = shopCredits$.value;
  const pct = Math.min(100, Math.round((credits / ROUND_CREDITS) * 100));

  let barClass = styles.creditBar;
  if (pulse === 'spend') {
    barClass += ` ${styles.pulseSpend}`;
  }
  if (pulse === 'gain') {
    barClass += ` ${styles.pulseGain}`;
  }

  return (
    <div class={barClass} onAnimationEnd={onPulseEnd}>
      <Coins size={14} />
      <span class={styles.creditValue}>{credits} CR</span>
      <div class={styles.creditGauge}>
        <div class={styles.creditFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
