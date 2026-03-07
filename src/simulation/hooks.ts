/**
 * ダメージ/サポートイベントフック — onKillUnit と同パターン
 *
 * 【制約】フックに渡されるイベントオブジェクトは GC 回避のため再利用される。
 * フック内でイベントの参照を保持してはならない。値が必要な場合は即座にコピーすること。
 */

import { unit } from '../pools.ts';
import type { Team, UnitIndex } from '../types.ts';
import { NO_UNIT } from '../types.ts';

type DamageKind = 'direct' | 'aoe' | 'beam' | 'ram' | 'chain' | 'sweep' | 'emp' | 'reflect';
type SupportKind = 'heal' | 'amp' | 'scramble' | 'catalyst';

// ─── Damage Hook ─────────────────────────────────────────────────

interface DamageEvent {
  attackerType: number;
  attackerTeam: Team;
  victimType: number;
  victimTeam: Team;
  amount: number;
  kind: DamageKind;
}

const _pooledDmgEvent: DamageEvent = {
  attackerType: 0,
  attackerTeam: 0 as Team,
  victimType: 0,
  victimTeam: 0 as Team,
  amount: 0,
  kind: 'direct',
};

type DamageHook = (e: Readonly<DamageEvent>) => void;
const damageHooks: DamageHook[] = [];

type Unsubscribe = () => void;

export function onDamageUnit(hook: DamageHook): Unsubscribe {
  damageHooks.push(hook);
  return () => {
    const idx = damageHooks.indexOf(hook);
    if (idx !== -1) {
      damageHooks.splice(idx, 1);
    }
  };
}

export function emitDamage(
  attackerType: number,
  attackerTeam: Team,
  victimType: number,
  victimTeam: Team,
  amount: number,
  kind: DamageKind,
): void {
  if (damageHooks.length === 0) {
    return;
  }
  _pooledDmgEvent.attackerType = attackerType;
  _pooledDmgEvent.attackerTeam = attackerTeam;
  _pooledDmgEvent.victimType = victimType;
  _pooledDmgEvent.victimTeam = victimTeam;
  _pooledDmgEvent.amount = amount;
  _pooledDmgEvent.kind = kind;
  for (const h of damageHooks) {
    h(_pooledDmgEvent);
  }
}

export function _resetDamageHooks(): void {
  damageHooks.length = 0;
}

/**
 * sourceUnit が NO_UNIT でなく alive であれば emitDamage を発火する共通ヘルパー。
 * emitTetherDamage / emitProjectileDamage の重複パターンを統合。
 */
export function emitDamageFrom(
  sourceIndex: UnitIndex,
  victimType: number,
  victimTeam: Team,
  amount: number,
  kind: DamageKind,
): void {
  if (sourceIndex === NO_UNIT) {
    return;
  }
  const src = unit(sourceIndex);
  if (src.alive) {
    emitDamage(src.type, src.team, victimType, victimTeam, amount, kind);
  }
}

// ─── Support Hook ────────────────────────────────────────────────

interface SupportEvent {
  casterType: number;
  casterTeam: Team;
  targetType: number;
  targetTeam: Team;
  kind: SupportKind;
  amount: number;
}

const _pooledSupEvent: SupportEvent = {
  casterType: 0,
  casterTeam: 0 as Team,
  targetType: 0,
  targetTeam: 0 as Team,
  kind: 'heal',
  amount: 0,
};

type SupportHook = (e: Readonly<SupportEvent>) => void;
const supportHooks: SupportHook[] = [];

export function onSupportEffect(hook: SupportHook): Unsubscribe {
  supportHooks.push(hook);
  return () => {
    const idx = supportHooks.indexOf(hook);
    if (idx !== -1) {
      supportHooks.splice(idx, 1);
    }
  };
}

export function emitSupport(
  casterType: number,
  casterTeam: Team,
  targetType: number,
  targetTeam: Team,
  kind: SupportKind,
  amount: number,
): void {
  if (supportHooks.length === 0) {
    return;
  }
  _pooledSupEvent.casterType = casterType;
  _pooledSupEvent.casterTeam = casterTeam;
  _pooledSupEvent.targetType = targetType;
  _pooledSupEvent.targetTeam = targetTeam;
  _pooledSupEvent.kind = kind;
  _pooledSupEvent.amount = amount;
  for (const h of supportHooks) {
    h(_pooledSupEvent);
  }
}

export function _resetSupportHooks(): void {
  supportHooks.length = 0;
}

// ─── Sim Time ─────────────────────────────────────────────────────

let _currentSimTime = 0;
export function setCurrentSimTime(t: number): void {
  _currentSimTime = t;
}
export function getCurrentSimTime(): number {
  return _currentSimTime;
}
export function _resetSimTime(): void {
  _currentSimTime = 0;
}
