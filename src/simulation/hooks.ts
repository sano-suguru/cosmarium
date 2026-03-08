/**
 * ダメージ/サポートイベントフック — onKillUnit と同パターン
 *
 * 【制約】フックに渡されるイベントオブジェクトは GC 回避のため再利用される。
 * フック内でイベントの参照を保持してはならない。値が必要な場合は即座にコピーすること。
 */

import type { Team } from '../types.ts';
import { stackAt, subscribe } from './hook-utils.ts';

/**
 * 全ダメージイベント用の細粒度分類（9値）。
 * KILL_CONTEXT（on-kill-effects.ts）とは多対一の関係:
 *   'direct'  → ProjectileDirect
 *   'aoe'     → ProjectileAoe
 *   'beam','emp','reflect','tether' → Beam
 *   'ram'     → Ram
 *   'chain'   → ChainLightning
 *   'sweep'   → SweepBeam
 */
type DamageKind = 'direct' | 'aoe' | 'beam' | 'ram' | 'chain' | 'sweep' | 'emp' | 'reflect' | 'tether';
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

const _DMG_MAX_DEPTH = 4;
const _dmgStack: DamageEvent[] = Array.from(
  { length: _DMG_MAX_DEPTH },
  (): DamageEvent => ({
    attackerType: 0,
    attackerTeam: 0 as Team,
    victimType: 0,
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
  casterType: number;
  casterTeam: Team;
  targetType: number;
  targetTeam: Team;
  kind: SupportKind;
  amount: number;
}

const _SUP_MAX_DEPTH = 4;
const _supStack: SupportEvent[] = Array.from(
  { length: _SUP_MAX_DEPTH },
  (): SupportEvent => ({
    casterType: 0,
    casterTeam: 0 as Team,
    targetType: 0,
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
