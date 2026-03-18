import { Crosshair } from 'lucide-preact';
import { SPEEDS } from '../../constants.ts';
import type { TimeScale } from '../../types.ts';
import { autoFollowActive$, timeScale$ } from '../signals.ts';
import styles from './PlayControls.module.css';

const SPEED_LABELS = ['\u25b6', '\u25b6\u25b6', '\u25b6\u25b6\u25b6'] as const;

type PlayControlsProps = {
  readonly onAutoFollowToggle: () => void;
  readonly onSpeedChange: (speed: TimeScale) => void;
};

export function PlayControls({ onAutoFollowToggle, onSpeedChange }: PlayControlsProps) {
  const speed = timeScale$.value;
  const followActive = autoFollowActive$.value;

  return (
    <>
      <button
        type="button"
        class={`${styles.autoFollowBtn} ${followActive ? styles.autoFollowBtnActive : ''}`}
        onClick={onAutoFollowToggle}
      >
        <Crosshair size={12} /> FOLLOW
      </button>
      <div class={styles.controls}>
        <span class={styles.controlsDesktop}>
          [ SCROLL: Zoom ] [ DRAG: Pan ] [ SPACE: Reset ] [ F: Follow ] [ +/-: Speed ] [ 1/2/3: Speed ]
        </span>
        <span class={styles.controlsTouch}>
          [ ピンチ: ズーム ] [ ドラッグ: パン ] [ ミニマップ: ジャンプ ] [ ▶: 速度 ]
        </span>
      </div>
      <div class={styles.speed}>
        <span class={styles.speedLabel}>SPEED</span>
        {SPEEDS.map((s, i) => (
          <button
            key={s}
            type="button"
            class={`${styles.sbtn} ${speed === s ? styles.sbtnActive : ''}`}
            onClick={() => onSpeedChange(s)}
          >
            {SPEED_LABELS[i]}
          </button>
        ))}
      </div>
    </>
  );
}
