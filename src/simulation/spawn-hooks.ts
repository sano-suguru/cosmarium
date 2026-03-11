import { unitIdx } from '../pool-index.ts';
import type { Team } from '../team.ts';
import { TEAM0 } from '../team.ts';
import type { SquadronIndex, UnitIndex, UnitTypeIndex } from '../types.ts';
import { NO_SQUADRON, NO_UNIT } from '../types.ts';
import { DEFAULT_UNIT_TYPE } from '../unit-type-accessors.ts';
import { EVENT_STACK_MAX_DEPTH, stackAt, subscribe } from './hook-utils.ts';
import type { KillContext } from './on-kill-effects.ts';

// ─── Kill Hook ───────────────────────────────────────────────────

type KillEvent = {
  victim: UnitIndex;
  victimTeam: Team;
  victimType: UnitTypeIndex;
  victimSquadronIdx: SquadronIndex;
  /** decUnits 後の victimTeam の残存ユニット数。0 なら全滅。 */
  victimTeamRemaining: number;
  killContext: KillContext;
} & (
  | { killer: UnitIndex; killerTeam: Team; killerType: UnitTypeIndex }
  | { killer: typeof NO_UNIT; killerTeam?: undefined; killerType?: undefined }
);

type KillUnitHook = (e: KillEvent) => void;
const killUnitHooks: KillUnitHook[] = [];
const permanentKillUnitHooks: KillUnitHook[] = [];

/** hookを登録し、登録解除用のunsubscribe関数を返す。呼び出し元がライフサイクルを管理すること */
export function onKillUnit(hook: KillUnitHook): () => void {
  return subscribe(killUnitHooks, hook);
}

/** 永続フック登録。モジュール/アプリ初期化時に使用（unsubscribe不要、テストリセット対象外） */
export function onKillUnitPermanent(hook: KillUnitHook): void {
  permanentKillUnitHooks.push(hook);
}

/** テスト専用: テスト用killUnitHooksをクリア。永続フックは維持。pool-helper.tsのresetPools()から呼ばれる */
export function _resetKillUnitHooks(): void {
  killUnitHooks.length = 0;
  _keDepth = 0;
}

// GC回避: KillEvent 深度インデックスド・スタック（再入安全・hookは参照保存しない前提）
const _keWK = Array.from(
  { length: EVENT_STACK_MAX_DEPTH },
  (): KillEvent & { killerTeam: Team; killerType: UnitTypeIndex } => ({
    victim: unitIdx(0),
    victimTeam: TEAM0,
    victimType: DEFAULT_UNIT_TYPE,
    victimSquadronIdx: NO_SQUADRON,
    victimTeamRemaining: 0,
    killContext: 0,
    killer: unitIdx(0),
    killerTeam: TEAM0,
    killerType: DEFAULT_UNIT_TYPE,
  }),
);
const _keNK = Array.from({ length: EVENT_STACK_MAX_DEPTH }, (): KillEvent & { killer: typeof NO_UNIT } => ({
  victim: unitIdx(0),
  victimTeam: TEAM0,
  victimType: DEFAULT_UNIT_TYPE,
  victimSquadronIdx: NO_SQUADRON,
  victimTeamRemaining: 0,
  killContext: 0,
  killer: NO_UNIT,
}));
let _keDepth = 0;

export function dispatchKillEvent(
  victim: UnitIndex,
  victimTeam: Team,
  victimType: UnitTypeIndex,
  victimSquadronIdx: SquadronIndex,
  killContext: KillContext,
  killer: { index: UnitIndex; team: Team; type: UnitTypeIndex } | undefined,
  victimTeamRemaining: number,
): void {
  const d = _keDepth++;
  let e: KillEvent;
  if (killer) {
    const ke = stackAt(_keWK, d);
    ke.victim = victim;
    ke.victimTeam = victimTeam;
    ke.victimType = victimType;
    ke.victimSquadronIdx = victimSquadronIdx;
    ke.victimTeamRemaining = victimTeamRemaining;
    ke.killContext = killContext;
    ke.killer = killer.index;
    ke.killerTeam = killer.team;
    ke.killerType = killer.type;
    e = ke;
  } else {
    const ke = stackAt(_keNK, d);
    ke.victim = victim;
    ke.victimTeam = victimTeam;
    ke.victimType = victimType;
    ke.victimSquadronIdx = victimSquadronIdx;
    ke.victimTeamRemaining = victimTeamRemaining;
    ke.killContext = killContext;
    e = ke;
  }
  for (const hook of killUnitHooks) {
    hook(e);
  }
  for (const hook of permanentKillUnitHooks) {
    hook(e);
  }
  _keDepth--;
}

// ─── Spawn Hook ──────────────────────────────────────────────────

interface SpawnEvent {
  unitIndex: UnitIndex;
  team: Team;
  type: UnitTypeIndex;
}

type SpawnUnitHook = (e: Readonly<SpawnEvent>) => void;
const spawnUnitHooks: SpawnUnitHook[] = [];

// GC回避: SpawnEvent 深度インデックスド・スタック（再入安全・Carrier等のフック内spawnUnit対応）
const _seStack = Array.from(
  { length: EVENT_STACK_MAX_DEPTH },
  (): SpawnEvent => ({ unitIndex: unitIdx(0), team: TEAM0, type: DEFAULT_UNIT_TYPE }),
);
let _seDepth = 0;

export function onSpawnUnit(hook: SpawnUnitHook): () => void {
  return subscribe(spawnUnitHooks, hook);
}

export function _resetSpawnUnitHooks(): void {
  spawnUnitHooks.length = 0;
  _seDepth = 0;
}

export function dispatchSpawnEvent(unitIndex: UnitIndex, team: Team, type: UnitTypeIndex): void {
  if (spawnUnitHooks.length === 0) {
    return;
  }
  const d = _seDepth++;
  const se = stackAt(_seStack, d);
  se.unitIndex = unitIndex;
  se.team = team;
  se.type = type;
  for (const h of spawnUnitHooks) {
    h(se);
  }
  _seDepth--;
}
