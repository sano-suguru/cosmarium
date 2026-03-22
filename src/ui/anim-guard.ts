import type { ReadonlySignal } from '@preact/signals';
import { signal } from '@preact/signals';

type AnimCommitHandle = { readonly cancel: () => void };

const ANIM_MARGIN_MS = 100;

export function scheduleAnimCommit(commit: () => void, cssDurationMs: number): AnimCommitHandle {
  let cancelled = false;
  const timer = setTimeout(() => {
    if (!cancelled) {
      commit();
    }
  }, cssDurationMs + ANIM_MARGIN_MS);
  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
    },
  };
}

type AnimSlot<T> = {
  readonly $: ReadonlySignal<T>;
  start(value: Exclude<T, null | false>, commit: () => void, durationMs: number): void;
  cancel(): void;
};

export function createAnimSlot<T>(initial: T): AnimSlot<T> {
  const s = signal<T>(initial);
  let pending: AnimCommitHandle | null = null;

  return {
    get $() {
      return s;
    },
    start(value, commit, durationMs) {
      pending?.cancel();
      s.value = value as T;
      pending = scheduleAnimCommit(() => {
        commit();
        s.value = initial;
        pending = null;
      }, durationMs);
    },
    cancel() {
      pending?.cancel();
      pending = null;
      s.value = initial;
    },
  };
}
