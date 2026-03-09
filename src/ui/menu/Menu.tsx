import styles from './Menu.module.css';

type MenuProps = {
  readonly onStart: () => void;
  readonly onSpectate: () => void;
  readonly onMelee: () => void;
  readonly onCodex: () => void;
};

export function Menu({ onStart, onSpectate, onMelee, onCodex }: MenuProps) {
  return (
    <div class={styles.menu}>
      <h1 class={styles.title}>COSMARIUM</h1>
      <div class={styles.sub}>AUTONOMOUS FLEET WARFARE</div>
      <button type="button" class="mbtn" onClick={onStart}>
        START<span class={styles.desc}>艦隊を編成して宇宙戦を戦い抜け</span>
      </button>
      <button type="button" class="mbtn" onClick={onSpectate}>
        SPECTATE<span class={styles.desc}>終わりなき宇宙艦隊戦を観測せよ</span>
      </button>
      <button type="button" class="mbtn" onClick={onMelee}>
        MELEE<span class={styles.desc}>2〜5勢力のランダム乱戦を観戦せよ</span>
      </button>
      <button type="button" class="mbtn" onClick={onCodex}>
        CODEX<span class={styles.desc}>全艦種の戦術データと実戦デモを参照</span>
      </button>
    </div>
  );
}
