# COSMARIUM Refactoring Considerations

## State Setter Pattern

State variables in `src/state.ts` use `export let` + setter functions because ES module exports cannot be reassigned from importers.

When renaming a state variable:
1. Rename the variable declaration in `state.ts`
2. Rename the corresponding setter function (e.g., `setGameState()`)
3. Update all import sites — both the variable and the setter
4. Verify with `references` on both the variable and setter

## Pool System Constraints

Pool arrays (`uP`, `pP`, `prP`) are pre-allocated and use `.alive` flags. When modifying pool-related code:
- Never change pool sizes without updating constants in `constants.ts`
- Spawn functions (`spU`, `spP`, `spPr`) scan for dead slots — maintain this pattern
- `poolCounts` properties are mutated directly (not via setters)

## WebGL Resource Lifecycle

Renderer resources (programs, buffers, VAOs, FBOs) are initialized in a specific order defined in `main.ts`. When refactoring renderer code:
- Maintain initialization order: initWebGL -> initShaders -> mkFBOs -> initBuffers
- Shader uniform/attribute locations (`Loc`, `mmLoc`, `blLoc`, `coLoc`) are set once after program creation
- FBO references in `fbos` object are used across render passes

## Abbreviated Names

The codebase uses abbreviated names (documented in CLAUDE.md). When refactoring:
- Do NOT rename abbreviated names unless explicitly requested — this is a separate task
- When adding new code that interfaces with abbreviated APIs, follow the existing convention
- If renaming IS requested, ensure all references (including comments and UI strings) are updated

## Module Boundaries

Consult AGENTS.md files for module-specific guidance:
- `AGENTS.md` (root) — overall architecture
- `src/renderer/AGENTS.md` — rendering pipeline specifics
- `src/simulation/AGENTS.md` — simulation loop specifics
- `src/shaders/AGENTS.md` — GLSL shader specifics

## Import Convention

All imports use relative paths with explicit `.ts` extension:
```typescript
import { spU } from './spawn.ts';
import type { Unit } from '../types.ts';
```

When moving files, update all import paths accordingly. Use `references` to locate all importers.

## Type-Only Imports

`verbatimModuleSyntax: true` requires `import type` for type-only imports:
```typescript
// Correct
import type { Unit } from '../types.ts';

// Incorrect — will cause build error
import { Unit } from '../types.ts';  // if Unit is only used as a type
```

## Biome Lint Rules

After refactoring, verify compliance:
- `noUnusedImports: error` — remove any imports made unused by the refactor
- `noUnusedVariables: error` — remove unused variables (prefix with `_` if intentionally unused)
- `noVar: error` — use `const`/`let` only
- `useConst: error` — use `const` when variable is never reassigned
