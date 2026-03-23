import { signal } from '@preact/signals';
import { LogOut } from 'lucide-preact';
import { useEffect } from 'preact/hooks';
import styles from './RetireButton.module.css';

const CONFIRM_TIMEOUT_MS = 3000;

const confirming$ = signal(false);
let resetTimer = 0;

function clearReset() {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = 0;
  }
}

export function _resetRetireButton() {
  confirming$.value = false;
  clearReset();
}

type RetireButtonProps = {
  readonly onRetire: () => void;
  readonly inline?: boolean;
};

export function RetireButton({ onRetire, inline }: RetireButtonProps) {
  useEffect(() => () => _resetRetireButton(), []);
  const active = confirming$.value;

  const handleClick = () => {
    if (active) {
      clearReset();
      confirming$.value = false;
      onRetire();
      return;
    }
    confirming$.value = true;
    clearReset();
    resetTimer = window.setTimeout(() => {
      confirming$.value = false;
      resetTimer = 0;
    }, CONFIRM_TIMEOUT_MS);
  };

  const base = inline ? `${styles.retire} ${styles.retireInline}` : styles.retire;
  const cls = active ? `${base} ${styles.confirming}` : base;
  return (
    <button type="button" class={cls} onClick={handleClick}>
      <LogOut size={14} /> {active ? '本当にリタイア?' : 'RETIRE'}
    </button>
  );
}
