import type { ModuleId } from './types.ts';

/** GDD §3-E: Type A = 通常攻撃の書き換え, Type B = 独立イベントの追加 */
type ModuleKind = 'attack' | 'event';

type Tier = 'low' | 'mid' | 'high';

interface ModuleDef {
  readonly id: ModuleId;
  readonly name: string;
  readonly description: string;
  readonly kind: ModuleKind;
  readonly tier: Tier;
  /** Type A 効果: プロジェクタイルに AoE 半径を付与 (0 = 効果なし) */
  readonly aoeRadius: number;
}

const MODULES: readonly ModuleDef[] = [
  {
    id: 0 as ModuleId,
    name: '拡散弾頭',
    description: '通常攻撃に小範囲の爆破を付与する',
    kind: 'attack',
    tier: 'mid',
    aoeRadius: 40,
  },
];

export function moduleDef(id: ModuleId): ModuleDef {
  const def = MODULES[id];
  if (!def) {
    throw new RangeError(`moduleDef: invalid ModuleId ${id}`);
  }
  return def;
}

const ALL_MODULE_IDS: readonly ModuleId[] = MODULES.map((m) => m.id);

/** 全モジュール ID リスト（キャッシュ済み） */
export function allModuleIds(): readonly ModuleId[] {
  return ALL_MODULE_IDS;
}
