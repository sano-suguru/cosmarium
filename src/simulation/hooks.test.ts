import { afterEach, describe, expect, it, vi } from 'vitest';
import { asType } from '../__test__/pool-helper.ts';
import type { Team } from '../types.ts';
import type { DamageKind } from './hooks.ts';
import {
  _resetDamageHooks,
  _resetSupportHooks,
  emitDamage,
  emitSupport,
  onDamageUnit,
  onSupportEffect,
} from './hooks.ts';

afterEach(() => {
  _resetDamageHooks();
  _resetSupportHooks();
});

// ─── emitDamage ──────────────────────────────────────────────────

describe('emitDamage', () => {
  it('フック未登録 → クラッシュせず no-op', () => {
    expect(() => {
      emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 50, 'direct');
    }).not.toThrow();
  });

  it('登録後にイベントが配信される', () => {
    const hook = vi.fn();
    onDamageUnit(hook);
    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 30, 'beam');
    expect(hook).toHaveBeenCalledOnce();
  });

  it('全フィールドが正しく渡される', () => {
    const hook = vi.fn();
    onDamageUnit(hook);

    emitDamage(asType(2), 1 as Team, asType(3), 0 as Team, 42.5, 'aoe');

    const ev = hook.mock.calls[0]?.[0];
    expect(ev.attackerType).toBe(2);
    expect(ev.attackerTeam).toBe(1);
    expect(ev.victimType).toBe(3);
    expect(ev.victimTeam).toBe(0);
    expect(ev.amount).toBe(42.5);
    expect(ev.kind).toBe('aoe');
  });

  it('複数フック登録時に全て呼ばれる', () => {
    const hook1 = vi.fn();
    const hook2 = vi.fn();
    const hook3 = vi.fn();
    onDamageUnit(hook1);
    onDamageUnit(hook2);
    onDamageUnit(hook3);

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');

    expect(hook1).toHaveBeenCalledOnce();
    expect(hook2).toHaveBeenCalledOnce();
    expect(hook3).toHaveBeenCalledOnce();
  });

  it('unsubscribe 後はフックが呼ばれない', () => {
    const hook = vi.fn();
    const unsub = onDamageUnit(hook);

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');
    expect(hook).toHaveBeenCalledOnce();

    unsub();
    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');
    expect(hook).toHaveBeenCalledOnce(); // 増えない
  });

  it('_resetDamageHooks で全フッククリア', () => {
    const hook1 = vi.fn();
    const hook2 = vi.fn();
    onDamageUnit(hook1);
    onDamageUnit(hook2);

    _resetDamageHooks();

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');
    expect(hook1).not.toHaveBeenCalled();
    expect(hook2).not.toHaveBeenCalled();
  });
});

// ─── emitSupport ─────────────────────────────────────────────────

describe('emitSupport', () => {
  const supportKinds = ['heal', 'amp', 'scramble', 'catalyst'] as const;

  for (const kind of supportKinds) {
    it(`kind="${kind}" でイベント配信される`, () => {
      const hook = vi.fn();
      onSupportEffect(hook);

      emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, kind, 25);

      expect(hook).toHaveBeenCalledOnce();
      const ev = hook.mock.calls[0]?.[0];
      expect(ev.casterType).toBe(0);
      expect(ev.casterTeam).toBe(0);
      expect(ev.targetType).toBe(1);
      expect(ev.targetTeam).toBe(0);
      expect(ev.kind).toBe(kind);
      expect(ev.amount).toBe(25);
    });
  }

  it('unsubscribe 後はフックが呼ばれない', () => {
    const hook = vi.fn();
    const unsub = onSupportEffect(hook);

    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'heal', 10);
    expect(hook).toHaveBeenCalledOnce();

    unsub();
    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'heal', 10);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('_resetSupportHooks で全フッククリア', () => {
    const hook = vi.fn();
    onSupportEffect(hook);

    _resetSupportHooks();

    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'heal', 10);
    expect(hook).not.toHaveBeenCalled();
  });
});

// ─── 再入テスト ──────────────────────────────────────────────────

describe('再入安全性', () => {
  it('hook 内で emitDamage を呼んでもイベント値が混ざらない', () => {
    const outerValues: { kind: DamageKind; amount: number }[] = [];
    const innerValues: { kind: DamageKind; amount: number }[] = [];

    onDamageUnit((e) => {
      if (e.kind === 'beam') {
        // 外側イベント → 内側 emitDamage を再入発火
        emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 99, 'chain');
        // 再入から戻った後も外側の値が保持されていること
        outerValues.push({ kind: e.kind, amount: e.amount });
      } else {
        innerValues.push({ kind: e.kind, amount: e.amount });
      }
    });

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 50, 'beam');

    expect(outerValues).toEqual([{ kind: 'beam', amount: 50 }]);
    expect(innerValues).toEqual([{ kind: 'chain', amount: 99 }]);
  });
});

// ─── 複合フック統合 ─────────────────────────────────────────────

describe('複合フック統合', () => {
  it('onDamageUnit + onSupportEffect を同時登録し独立に配信される', () => {
    const damageEvents: number[] = [];
    const supportEvents: string[] = [];

    onDamageUnit((e) => {
      damageEvents.push(e.amount);
    });
    onSupportEffect((e) => {
      supportEvents.push(e.kind);
    });

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');
    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'heal', 20);
    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 30, 'beam');

    expect(damageEvents).toEqual([10, 30]);
    expect(supportEvents).toEqual(['heal']);
  });

  it('片方の unsubscribe が他方に影響しない', () => {
    const damageEvents: number[] = [];
    const supportEvents: string[] = [];

    const unsubDamage = onDamageUnit((e) => {
      damageEvents.push(e.amount);
    });
    onSupportEffect((e) => {
      supportEvents.push(e.kind);
    });

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 10, 'direct');
    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'amp', 5);

    unsubDamage();

    emitDamage(asType(0), 0 as Team, asType(1), 1 as Team, 20, 'direct');
    emitSupport(asType(0), 0 as Team, asType(1), 0 as Team, 'heal', 15);

    expect(damageEvents).toEqual([10]);
    expect(supportEvents).toEqual(['amp', 'heal']);
  });
});
