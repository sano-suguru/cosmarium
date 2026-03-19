import { signal } from '@preact/signals';
import {
  Anchor,
  ArrowLeft,
  Check,
  CircleDollarSign,
  Flame,
  Hexagon,
  Rocket,
  Shield,
  Warehouse,
  Zap,
} from 'lucide-preact';
import type { JSX } from 'preact';
import { MOTHERSHIP_DEFS } from '../../mothership-defs.ts';
import type { UnitTypeIndex } from '../../types.ts';
import {
  ACCELERATOR_TYPE,
  BLOODBORNE_TYPE,
  CARRIER_BAY_TYPE,
  COLOSSUS_TYPE,
  DREADNOUGHT_TYPE,
  HIVE_TYPE,
  REACTOR_TYPE,
  SYNDICATE_TYPE,
} from '../../unit-type-accessors.ts';
import btnStyles from '../shared/button.module.css';
import styles from './MothershipSelect.module.css';
import { buildMothershipStats } from './mothership-stats.ts';

const ACCENT_COLORS = new Map<UnitTypeIndex, string>([
  [HIVE_TYPE, '#0f8'],
  [DREADNOUGHT_TYPE, '#88f'],
  [REACTOR_TYPE, '#f80'],
  [COLOSSUS_TYPE, '#a8f'],
  [CARRIER_BAY_TYPE, '#8cf'],
  [ACCELERATOR_TYPE, '#ff4'],
  [SYNDICATE_TYPE, '#fc4'],
  [BLOODBORNE_TYPE, '#f44'],
]);

const TONE_CLASSES = {
  buff: styles.statBuff,
  debuff: styles.statDebuff,
  neutral: styles.statNeutral,
} as const;

const ICON_MAP = new Map<UnitTypeIndex, () => JSX.Element>([
  [DREADNOUGHT_TYPE, () => <Shield size={28} />],
  [REACTOR_TYPE, () => <Zap size={28} />],
  [COLOSSUS_TYPE, () => <Anchor size={28} />],
  [CARRIER_BAY_TYPE, () => <Warehouse size={28} />],
  [ACCELERATOR_TYPE, () => <Rocket size={28} />],
  [SYNDICATE_TYPE, () => <CircleDollarSign size={28} />],
  [BLOODBORNE_TYPE, () => <Flame size={28} />],
]);

function mothershipIcon(type: UnitTypeIndex) {
  const factory = ICON_MAP.get(type);
  return factory ? factory() : <Hexagon size={28} />;
}

const selected$ = signal<UnitTypeIndex | null>(null);

export function _resetMothershipSelect() {
  selected$.value = null;
}

type MothershipSelectProps = {
  readonly onConfirm: (type: UnitTypeIndex) => void;
  readonly onBack: () => void;
};

export function MothershipSelect({ onConfirm, onBack }: MothershipSelectProps) {
  const current = selected$.value;

  return (
    <div class={styles.overlay}>
      <h1 class={styles.title}>SELECT YOUR MOTHERSHIP</h1>
      <div class={styles.subtitle}>この選択はラン全体に影響します — 途中変更不可</div>
      <div class={styles.cardGrid}>
        {MOTHERSHIP_DEFS.map((d) => {
          const active = current === d.type;
          const stats = buildMothershipStats(d);
          const accent = ACCENT_COLORS.get(d.type) ?? '#0ff';
          return (
            <button
              key={d.type}
              type="button"
              class={`${styles.card} ${active ? styles.cardActive : ''}`}
              style={{ '--accent': accent } as Record<string, string>}
              onClick={() => {
                selected$.value = d.type;
              }}
            >
              <div class={styles.cardIcon}>{mothershipIcon(d.type)}</div>
              <div class={styles.cardName}>{d.name}</div>
              <div class={styles.cardDesc}>{d.description}</div>
              <ul class={styles.statList}>
                {stats.map((s) => (
                  <li key={s.label} class={`${styles.statRow} ${TONE_CLASSES[s.tone]}`}>
                    <span>{s.label}</span>
                    <span>{s.value}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <div class={styles.actions}>
        <button type="button" class={btnStyles.btn} onClick={onBack}>
          <ArrowLeft size={14} /> BACK
        </button>
        <button
          type="button"
          class={btnStyles.btn}
          disabled={current === null}
          onClick={() => {
            if (current !== null) {
              onConfirm(current);
              selected$.value = null;
            }
          }}
        >
          <Check size={14} /> CONFIRM
        </button>
      </div>
    </div>
  );
}
