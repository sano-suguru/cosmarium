import { color, color3ToRgb } from '../../colors.ts';
import { isPurchasable } from '../../fleet-cost.ts';
import { TYPE_INDICES, unitType } from '../../unit-type-accessors.ts';
import { TYPES } from '../../unit-types.ts';
import { codexSelected$ } from '../signals.ts';
import styles from './Codex.module.css';
import { selectCodexUnit } from './codex-logic.ts';

type StatBarProps = {
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly color: string;
};

function StatBar({ label, current, max, color: barColor }: StatBarProps) {
  const pct = `${(current / max) * 100}%`;
  return (
    <>
      <div>
        {label}: {current}
      </div>
      <div class={styles.cpBar}>
        <div
          style={{
            width: pct,
            background: `linear-gradient(to right, ${barColor} 60%, transparent)`,
            boxShadow: `0 0 4px ${barColor}`,
          }}
        />
      </div>
    </>
  );
}

function CodexStatsPanel() {
  const sel = codexSelected$.value;
  const t = unitType(sel);
  const c0 = color(sel, 0);
  const c1 = color(sel, 1);
  const col = color3ToRgb(c0);
  const col2 = color3ToRgb(c1);

  return (
    <div class={styles.panel}>
      <div class={styles.panelLeft}>
        <div class={styles.panelName} style={{ color: col }}>
          {t.name}
        </div>
        <div class={styles.panelDesc}>{t.description}</div>
      </div>
      <div class={styles.panelRight}>
        <div class={styles.panelStats}>
          <StatBar label="HP" current={t.hp} max={200} color="#0ff" />
          <StatBar label="SPEED" current={t.speed} max={260} color="#0af" />
          <StatBar label="DAMAGE" current={t.damage} max={18} color="#f0f" />
          <StatBar
            label={t.attackRange > 0 ? 'RANGE' : 'DETECT'}
            current={t.attackRange > 0 ? t.attackRange : t.aggroRange}
            max={600}
            color="#a0f"
          />
          <StatBar label="MASS" current={t.mass} max={30} color="#48f" />
          <div class={styles.attackDesc} style={{ color: col }}>
            : {t.attackDesc}
          </div>
          <div class={styles.teamColors}>
            Team colors: <span style={{ color: col }}>A</span> vs <span style={{ color: col2 }}>B</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodexSidebar() {
  const selected = codexSelected$.value;

  return (
    <div class={styles.side}>
      <h3 class={styles.sideTitle}>UNIT CODEX</h3>
      <div>
        {TYPE_INDICES.map((idx) => {
          const t = TYPES[idx];
          if (!t || !isPurchasable(idx)) {
            return null;
          }
          const c = color(idx, 0);
          const rgb = color3ToRgb(c);
          const hue = 180 + (idx / Math.max(TYPES.length - 1, 1)) * 120;
          const dotColor = `hsl(${hue}, 100%, 60%)`;
          const isActive = idx === selected;

          return (
            <button
              key={idx}
              type="button"
              class={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => {
                selectCodexUnit(idx);
              }}
            >
              <div class={styles.itemDot} style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
              <div>
                <div class={styles.itemName} style={{ color: rgb }}>
                  {t.name}
                </div>
                <div class={styles.itemType}>{t.attackDesc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
type CodexProps = {
  readonly onClose: () => void;
};

export function Codex({ onClose }: CodexProps) {
  return (
    <div class={styles.codex}>
      <CodexSidebar />
      <div class={styles.info}>
        <div class={styles.demo}>
          <div class={styles.hint}>戦術パターン — リアルタイムシミュレーション</div>
        </div>
        <CodexStatsPanel />
        <button type="button" class={styles.closeBtn} onClick={onClose}>
          ESC
        </button>
      </div>
    </div>
  );
}
