import { moduleDef } from './module-defs.ts';
import type { ModuleId } from './types.ts';
import { NO_MODULE } from './types.ts';

/** モジュールが付与する AoE 半径を返す。NO_MODULE または AoE 効果なしなら 0 */
export function getModuleAoe(moduleId: ModuleId): number {
  if (moduleId === NO_MODULE) {
    return 0;
  }
  return moduleDef(moduleId).aoeRadius;
}
