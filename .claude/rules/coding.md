---
paths:
  - "src/**/*.ts"
---

# Coding Conventions

## Change Philosophy

Favor structural correctness over minimal diffs. Make all necessary changes — don't minimize with local patches. Suggest improvements when found.

## General

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. Modify only via `incUnits()`/`decUnits()` etc.
- **Pool accessors**: `unit(i)`/`particle(i)`/`projectile(i)` — centralized `noUncheckedIndexedAccess` checks
- **beams**: Dynamic array — swap-and-pop for deletion (order not preserved)
- **レイヤー分離**: シミュレーション/レンダリング層はクラスなし・plain typed objects。UI 層は Preact 関数コンポーネント + CSS Modules
- **Import**: Relative paths + explicit `.ts` extension. No path aliases, no barrel exports
- **Constant placement**: `constants.ts` for multi-module constants only. Single-module thresholds stay local
- **Japanese UI**: Menu descriptions and unit abilities in Japanese

## Biome

Pre-commit hook runs `biome check --staged --write`. Key rules:
- `noConsole: error` — only `console.error`/`console.warn` allowed (test files exempt)
- `noNonNullAssertion: error` — `!` forbidden
- `noExplicitAny: error` — use proper types or `unknown` + type guard
- `noForEach: error` — use `for...of`
- `noBarrelFile: error` — no barrel exports
- `noExcessiveCognitiveComplexity: error` — max 15
- `noExcessiveLinesPerFile: error` — max 600 lines (test files exempt)
- Line width 120, single quotes, always semicolons
- `src/shaders/**` excluded from lint/format (GLSL)

## Dependency Rules (dependency-cruiser enforced)

- `simulation/` → `state.ts` forbidden — inject rng/state as arguments
- `simulation/` → `ui/` forbidden — inject callbacks to invert dependency
- `worker/` → `src/` forbidden — worker is server-side only

Validate with `bun run check:deps`.

## TypeScript Strict (non-obvious)

- `verbatimModuleSyntax` — type imports must use `import type { X }`
- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props (use `prop?: T | undefined`)
- `noUncheckedIndexedAccess` — array/record index returns `T | undefined`
- `noUnusedLocals` / `noUnusedParameters` — unused variables are errors

## No Defensive Fallbacks

No scattered `?? defaultValue`, redundant null checks, or defensive try-catch. Resolve defaults at definition time; make types required. DOM elements: use `getElement()` (throws on missing), treat as non-null thereafter.

## Division Unit Guidelines

- Type definition additions → validate with `bun run typecheck` → proceed
- Logic changes → validate with `bun run test:run` → proceed
- Shader changes → verify visually in browser → proceed

Maintain passing `bun run typecheck` at each unit. Don't change multiple modules at once and verify only at the end.

## Core File Impact

`types.ts` / `state.ts` changes cascade to all files. Always validate with `bun run typecheck` after changes.

## Type Safety Notes

- N-team 対応: 敵判定は `o.team !== u.team` パターンを使用（2-team 前提の `1 - team` は不可）
- `Team` 型は 0-4 を許容するが、実行時のチーム数は `gameLoopState.activeTeamCount` で決まる（SPECTATE/BATTLE=2, MELEE=2-5）
- `MAX_TEAMS` / `Team` / `TeamCounts` は `types.ts` に集約。`TeamCounts` は `MAX_TEAMS` から自動導出
- Pool loops require `i as UnitIndex` cast (also `ParticleIndex`, `ProjectileIndex`)
- `u.target` of `NO_UNIT` (-1) means no target; always check `.alive`
