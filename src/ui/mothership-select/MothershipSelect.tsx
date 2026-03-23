import { Anchor, ArrowLeft, CircleDollarSign, Flame, Hexagon, Rocket, Shield, Warehouse, Zap } from 'lucide-preact';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { MOTHERSHIP_DEFS } from '../../mothership-defs.ts';
import { addAberration, addFlash, addFreeze } from '../../screen-effects.ts';
import type { UnitTypeIndex } from '../../types.ts';
import {
  ACCELERATOR_TYPE,
  BLOODBORNE_TYPE,
  CARRIER_BAY_TYPE,
  COLOSSUS_TYPE,
  DREADNOUGHT_TYPE,
  REACTOR_TYPE,
  SYNDICATE_TYPE,
} from '../../unit-type-accessors.ts';
import { createAnimSlot, scheduleAnimCommit } from '../anim-guard.ts';
import { ACCENT_COLORS, buildAccentVars } from './accent-colors.ts';
import fx from './confirm-effect.module.css';
import { PARTICLE_STYLES } from './confirm-particles.ts';
import styles from './MothershipSelect.module.css';
import { buildMothershipStats } from './mothership-stats.ts';

const confirmAnim = createAnimSlot<UnitTypeIndex | null>(null);
let effectHandle: { cancel(): void } | null = null;

function cancelEffect() {
  effectHandle?.cancel();
  effectHandle = null;
}

export function _resetMothershipSelect() {
  confirmAnim.cancel();
  cancelEffect();
}

const MOTHERSHIP_STATS = new Map(MOTHERSHIP_DEFS.map((d) => [d.type, buildMothershipStats(d)] as const));

const TONE_CLASSES = {
  buff: styles.statBuff,
  debuff: styles.statDebuff,
  neutral: styles.statNeutral,
} as const;

const ICON_MAP = new Map<UnitTypeIndex, () => JSX.Element>([
  [DREADNOUGHT_TYPE, () => <Shield size={36} />],
  [REACTOR_TYPE, () => <Zap size={36} />],
  [COLOSSUS_TYPE, () => <Anchor size={36} />],
  [CARRIER_BAY_TYPE, () => <Warehouse size={36} />],
  [ACCELERATOR_TYPE, () => <Rocket size={36} />],
  [SYNDICATE_TYPE, () => <CircleDollarSign size={36} />],
  [BLOODBORNE_TYPE, () => <Flame size={36} />],
]);

function mothershipIcon(type: UnitTypeIndex) {
  const factory = ICON_MAP.get(type);
  return factory ? factory() : <Hexagon size={36} />;
}

function cardClass(isSelected: boolean, isDismissed: boolean) {
  if (isSelected) {
    return `${styles.card} ${fx.confirmPulse}`;
  }
  if (isDismissed) {
    return `${styles.card} ${fx.dismissed}`;
  }
  return styles.card;
}

type MothershipSelectProps = {
  readonly onConfirm: (type: UnitTypeIndex) => void;
  readonly onBack: () => void;
};

export function MothershipSelect({ onConfirm, onBack }: MothershipSelectProps) {
  useEffect(() => () => _resetMothershipSelect(), []);

  const confirmed = confirmAnim.$.value;
  const confirmedAccent = confirmed !== null ? (ACCENT_COLORS.get(confirmed) ?? '#0ff') : undefined;

  function handleConfirm(type: UnitTypeIndex) {
    if (confirmAnim.$.value !== null) {
      return;
    }
    cancelEffect();
    effectHandle = scheduleAnimCommit(() => {
      addFlash(0.8);
      addAberration(0.6);
      addFreeze(0.04);
    }, 150);
    confirmAnim.start(
      type,
      () => {
        cancelEffect();
        onConfirm(type);
      },
      500,
    );
  }

  function handleBack() {
    if (confirmAnim.$.value !== null) {
      return;
    }
    onBack();
  }

  const overlayClass = confirmed !== null ? `${styles.overlay} ${fx.overlayFading}` : styles.overlay;
  const overlayStyle = confirmedAccent !== undefined ? buildAccentVars(confirmedAccent) : undefined;

  return (
    <div class={overlayClass} style={overlayStyle}>
      <button
        type="button"
        class={confirmed !== null ? `${styles.backBtn} ${fx.dismissed}` : styles.backBtn}
        onClick={handleBack}
      >
        <ArrowLeft size={14} /> BACK
      </button>
      <h1 class={confirmed !== null ? `${styles.title} ${fx.titleDismissed}` : styles.title} style={overlayStyle}>
        SELECT YOUR MOTHERSHIP
      </h1>
      <div class={styles.cardGrid}>
        {MOTHERSHIP_DEFS.map((d) => {
          const stats = MOTHERSHIP_STATS.get(d.type) ?? [];
          const accent = ACCENT_COLORS.get(d.type) ?? '#0ff';
          const isSelected = confirmed === d.type;
          const isDismissed = confirmed !== null && !isSelected;

          return (
            <button
              key={d.type}
              type="button"
              class={cardClass(isSelected, isDismissed)}
              style={buildAccentVars(accent)}
              onClick={() => handleConfirm(d.type)}
            >
              {isSelected && PARTICLE_STYLES.map((s, i) => <div key={i} class={fx.particle} style={s} />)}
              <div class={styles.cardHeader}>
                <div class={isSelected ? `${styles.cardIcon} ${fx.confirmIcon}` : styles.cardIcon}>
                  {mothershipIcon(d.type)}
                </div>
                <div class={isSelected ? `${styles.cardName} ${fx.confirmName}` : styles.cardName}>{d.name}</div>
              </div>
              <div class={styles.cardDesc}>{d.description}</div>
              <div class={styles.cardSeparator} />
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
    </div>
  );
}
