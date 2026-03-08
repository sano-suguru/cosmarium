/**
 * イベントフック共通ユーティリティ — GC回避スタック・subscribe/unsubscribe パターン
 */

type Unsubscribe = () => void;

/**
 * 深度インデックスド・スタックから要素を取得（再入安全）。深度超過時は throw。
 *
 * 最大深度 4 の根拠:
 * - 深度1: 通常の emit（戦闘ダメージ、サポート効果等）
 * - 深度2: on-kill-effects 内での再帰 emit（例: Reflector反射→ダメージ→キル→追加emit）
 * - 深度3: チェーン系能力の追加段（chain damage 等）
 * - 深度4: 安全マージン（想定外の再帰パスへの余裕）
 */
export function stackAt<T>(stack: T[], depth: number): T {
  const e = stack[depth];
  if (!e) {
    throw new Error(
      `Event stack overflow (depth=${depth}, max=${stack.length}). This indicates a re-entrant event chain exceeding ${stack.length} levels.`,
    );
  }
  return e;
}

/** フック配列への登録・解除を共通化 */
export function subscribe<T>(hooks: T[], hook: T): Unsubscribe {
  hooks.push(hook);
  return () => {
    const idx = hooks.indexOf(hook);
    if (idx !== -1) {
      hooks.splice(idx, 1);
    }
  };
}
