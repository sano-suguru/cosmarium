import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimSlot, scheduleAnimCommit } from './anim-guard.ts';

describe('scheduleAnimCommit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CSS duration + margin 後に commit が実行される', () => {
    const commit = vi.fn();
    scheduleAnimCommit(commit, 250);

    vi.advanceTimersByTime(350); // 250 + 100 margin
    expect(commit).toHaveBeenCalledOnce();
  });

  it('margin 到達前には commit されない', () => {
    const commit = vi.fn();
    scheduleAnimCommit(commit, 250);

    vi.advanceTimersByTime(349);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel() で commit が防止される', () => {
    const commit = vi.fn();
    const handle = scheduleAnimCommit(commit, 250);

    handle.cancel();
    vi.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
  });

  it('二重 cancel は安全（throw しない）', () => {
    const commit = vi.fn();
    const handle = scheduleAnimCommit(commit, 250);

    handle.cancel();
    expect(() => handle.cancel()).not.toThrow();
    vi.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('createAnimSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期値で signal が作成される', () => {
    const slot = createAnimSlot<string | null>(null);
    expect(slot.$.value).toBe(null);
  });

  it('start() で signal が更新され、duration + margin 後に commit + リセット', () => {
    const slot = createAnimSlot<string | null>(null);
    const commit = vi.fn();

    slot.start('active', commit, 250);
    expect(slot.$.value).toBe('active');
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(350);
    expect(commit).toHaveBeenCalledOnce();
    expect(slot.$.value).toBe(null);
  });

  it('cancel() で pending commit が防止され、signal が初期値に戻る', () => {
    const slot = createAnimSlot<number | null>(null);
    const commit = vi.fn();

    slot.start(42, commit, 300);
    expect(slot.$.value).toBe(42);

    slot.cancel();
    expect(slot.$.value).toBe(null);

    vi.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
  });

  it('start() 中に再度 start() すると前の pending がキャンセルされる', () => {
    const slot = createAnimSlot<string | null>(null);
    const commit1 = vi.fn();
    const commit2 = vi.fn();

    slot.start('first', commit1, 250);
    slot.start('second', commit2, 250);

    expect(slot.$.value).toBe('second');

    vi.advanceTimersByTime(350);
    expect(commit1).not.toHaveBeenCalled();
    expect(commit2).toHaveBeenCalledOnce();
    expect(slot.$.value).toBe(null);
  });

  it('二重 cancel は安全', () => {
    const slot = createAnimSlot(false);
    const commit = vi.fn();

    slot.start(true, commit, 200);
    slot.cancel();
    expect(() => slot.cancel()).not.toThrow();

    vi.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
  });
});
