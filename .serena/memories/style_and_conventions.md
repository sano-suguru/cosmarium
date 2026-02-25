# Code Style and Conventions

## Biome Configuration
- Single quotes, semicolons always, trailing commas all
- Indent width: 2, line width: 120
- `noConsole: error` — only `console.error`/`console.warn` allowed
- `noExplicitAny: error`, `noEvolvingTypes: error`, `noDelete: error`
- `noNonNullAssertion: error`, `noForEach: error` (use for-of)
- `noExcessiveCognitiveComplexity: error` (max 15)
- `noNestedTernary: error`, `noParameterAssign: error`
- `src/shaders/**` excluded from Biome

## TypeScript Strict Settings
- `verbatimModuleSyntax` — must use `import type { X }` for type-only imports
- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props
- `noUncheckedIndexedAccess` — array/record index returns `T | undefined`
- `noImplicitReturns`, `noFallthroughCasesInSwitch`
- `noUnusedLocals`, `noUnusedParameters`

## Import Conventions
- Relative paths + explicit `.ts` extension
- No path aliases, no barrel exports

## Dependency Rules
- `simulation/` → `state.ts` forbidden (rng/state via argument injection)
- `simulation/` → `ui/` forbidden (callback injection)
- Verify: `bun run check:deps`

## Naming & Design
- Functional/procedural (no classes)
- Game objects are plain typed objects
- State mutation via property assignment on `state` object
- `poolCounts` via `incUnits()`/`decUnits()` functions (direct mutation is type error)
- Beams: dynamic array, swap-and-pop for deletion
- Pool loop index: branded type cast (`i as UnitIndex`)
- Japanese UI text for menu descriptions and unit abilities

## Anti-Patterns
- `1 - team` returns `number` not `Team` → use `.team !== u.team`
- Never mutate `poolCounts` directly
- `u.target` is `UnitIndex`, `NO_UNIT` (-1) = no target; always check `.alive`
