/**
 * イベントフック共通ユーティリティ — GC回避スタック・subscribe/unsubscribe パターン
 */

type Unsubscribe = () => void;

/** 深度インデックスド・スタックから要素を取得（再入安全）。深度超過時は throw */
export function stackAt<T>(stack: T[], depth: number): T {
  const e = stack[depth];
  if (!e) {
    throw new Error('Event stack overflow');
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
