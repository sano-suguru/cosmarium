/**
 * ダメージ/サポートイベントフック — onKillUnit と同パターン
 *
 * 【制約】フックに渡されるイベントオブジェクトは GC 回避のため再利用される。
 * フック内でイベントの参照を保持してはならない。値が必要な場合は即座にコピーすること。
 *
 * 【独立性契約】各フックは他のフックの実行結果に依存してはならない。
 * フックは登録順（FIFO）に実行されるが、順序に依存するロジックは禁止。
 * 各フックは副作用（状態蓄積）のみ行い、制御フローを変更しないこと。
 */

import type { Team, UnitTypeIndex } from '../types.ts';
import { DEFAULT_UNIT_TYPE } from '../unit-types.ts';
import { stackAt, subscribe } from './hook-utils.ts';

export type DamageKind = 'direct' | 'aoe' | 'beam' | 'ram' | 'chain' | 'sweep' | 'emp' | 'reflect' | 'tether';
type SupportKind = 'heal' | 'amp' | 'scramble' | 'catalyst';

// ─── Damage Hook ─────────────────────────────────────────────────

interface DamageEvent {
  attackerType: UnitTypeIndex;
  attackerTeam: Team;
  victimType: UnitTypeIndex;
  victimTeam: Team;
  amount: number;
  kind: DamageKind;
}

const _DMG_MAX_DEPTH = 4;
const _dmgStack: DamageEvent[] = Array.from(
  { length: _DMG_MAX_DEPTH },
  (): DamageEvent => ({
    attackerType: DEFAULT_UNIT_TYPE,
    attackerTeam: 0 as Team,
    victimType: DEFAULT_UNIT_TYPE,
    victimTeam: 0 as Team,
    amount: 0,
    kind: 'direct',
  }),
);
let _dmgDepth = 0;

type DamageHook = (e: Readonly<DamageEvent>) => void;
const damageHooks: DamageHook[] = [];

export function onDamageUnit(hook: DamageHook): () => void {
  return subscribe(damageHooks, hook);
}

export function emitDamage(
  attackerType: UnitTypeIndex,
  attackerTeam: Team,
  victimType: UnitTypeIndex,
  victimTeam: Team,
  amount: number,
  kind: DamageKind,
): void {
  if (damageHooks.length === 0) {
    return;
  }
  const d = _dmgDepth++;
  const ev = stackAt(_dmgStack, d);
  ev.attackerType = attackerType;
  ev.attackerTeam = attackerTeam;
  ev.victimType = victimType;
  ev.victimTeam = victimTeam;
  ev.amount = amount;
  ev.kind = kind;
  for (const h of damageHooks) {
    h(ev);
  }
  _dmgDepth--;
}

export function _resetDamageHooks(): void {
  damageHooks.length = 0;
  _dmgDepth = 0;
}

// ─── Support Hook ────────────────────────────────────────────────

interface SupportEvent {
  casterType: UnitTypeIndex;
  casterTeam: Team;
  targetType: UnitTypeIndex;
  targetTeam: Team;
  kind: SupportKind;
  amount: number;
}

const _SUP_MAX_DEPTH = 4;
const _supStack: SupportEvent[] = Array.from(
  { length: _SUP_MAX_DEPTH },
  (): SupportEvent => ({
    casterType: DEFAULT_UNIT_TYPE,
    casterTeam: 0 as Team,
    targetType: DEFAULT_UNIT_TYPE,
    targetTeam: 0 as Team,
    kind: 'heal',
    amount: 0,
  }),
);
let _supDepth = 0;

type SupportHook = (e: Readonly<SupportEvent>) => void;
const supportHooks: SupportHook[] = [];

export function onSupportEffect(hook: SupportHook): () => void {
  return subscribe(supportHooks, hook);
}

export function emitSupport(
  casterType: UnitTypeIndex,
  casterTeam: Team,
  targetType: UnitTypeIndex,
  targetTeam: Team,
  kind: SupportKind,
  amount: number,
): void {
  if (supportHooks.length === 0) {
    return;
  }
  const d = _supDepth++;
  const ev = stackAt(_supStack, d);
  ev.casterType = casterType;
  ev.casterTeam = casterTeam;
  ev.targetType = targetType;
  ev.targetTeam = targetTeam;
  ev.kind = kind;
  ev.amount = amount;
  for (const h of supportHooks) {
    h(ev);
  }
  _supDepth--;
}

export function _resetSupportHooks(): void {
  supportHooks.length = 0;
  _supDepth = 0;
}
