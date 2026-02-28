# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese**.

## Project Overview

**COSMARIUM** — a real-time space strategy/combat simulation game using vanilla TypeScript, HTML5 Canvas, and WebGL 2. Built with Vite + bun. No UI framework.

## Development

Uses **Bun** as package manager. Zero production dependencies.

```bash
bun install          # Install dependencies
bun run dev          # Dev server at http://localhost:5173
bun run build        # Production build
bun run typecheck    # Type check (strict mode)
bun run lint:fix     # Biome lint with auto-fix
bun run format       # Biome format (write)
bun run format:check # Biome format check (read-only)
bun run knip         # Unused export detection
bun run cpd          # Copy-paste detection
bun run test         # Vitest watch mode
bun run test:run     # Vitest single run
bun run bench        # Vitest benchmark
bun run check        # All checks combined (typecheck + biome ci + knip + cpd + similarity + vitest run + check:deps)
```

**Biome** (config in `biome.json`): Pre-commit hook runs `bunx biome check --staged --no-errors-on-unmatched --write && git update-index --again`. Formatter: singleQuote, semicolons: always, trailingCommas: all, indentWidth: 2, lineWidth: 120. Key non-obvious rules:
- `noConsole: error` — only `console.error`/`console.warn` allowed (test files exempt)
- `noExplicitAny: error`, `noEvolvingTypes: error`, `noDelete: error`, `noBarrelFile: error`
- `noNonNullAssertion: error` — non-null assertion with `!` is forbidden
- `noForEach: error` — `forEach` is forbidden (use `for...of` instead)
- `noExcessiveCognitiveComplexity: error` — max complexity 15
- `noNestedTernary: error`, `noParameterAssign: error`
- `src/shaders/**` excluded from Biome

**Testing** ([Vitest](https://vitest.dev/)): `src/**/*.test.ts`, `environment: 'node'`, `restoreMocks: true`. Single test: `bunx vitest run src/path/to.test.ts`.

Helper utilities in `src/__test__/pool-helper.ts`:
- `resetPools()` — resets all pools to dead state and zeroes poolCounts
- `resetState()` — resets game state to menu defaults
- `spawnAt(team, type, x, y)` — injects a fixed RNG `() => 0` as argument for deterministic unit spawning

**Standard test pattern**: `afterEach(() => { resetPools(); resetState(); vi.restoreAllMocks(); })`. In simulation tests, use `vi.mock()` to stub out UI/camera dependencies.

GLSL shaders are imported via `vite-plugin-glsl` (`#include` directives). Shared SDF functions: `src/shaders/includes/sdf.glsl`.

**PRNG**: `rng()` (`state.ts`) — deterministic PRNG based on mulberry32. Seed can be fixed with `seedRng(seed)` (for testing). Simulation uses `rng()`. Camera shake jitter in `main.ts` `frame()` uses `Math.random()` (not seed-controlled).

**similarity-ts**: `bun run similarity` — code similarity detection (threshold 0.92, minimum 7 lines). Included in `check`.

## Game Mode

Infinite mode only. A persistent space war simulation.

## Architecture

```
src/
  main.ts            # Entry point + main loop
  types.ts           # All TypeScript interfaces
  constants.ts       # Pool limits, WORLD_SIZE, CELL_SIZE, MAX_INSTANCES, STRIDE_BYTES
  state.ts           # Game state object (mutable properties)
  pools.ts           # Object pools + poolCounts
  colors.ts          # Team/trail color tables + color()/trailColor()
  unit-types.ts      # TYPES[15] unit definitions
  shaders/           # GLSL source files (vite-plugin-glsl)
  renderer/          # WebGL 2 setup, shaders, FBO, buffers, scene/bloom/minimap rendering
  simulation/        # Spatial hash, spawn/kill, effects, steering, combat, update tick
  input/camera.ts    # Camera (cam object), mouse/wheel/drag, addShake()
  ui/                # Codex, game controls, HUD
```

**Main loop**: `frame()` → camera lerp/shake → `update(dt*timeScale)` → `renderFrame()`. See root `AGENTS.md` "Data Flow" section for details.

**Core files** (changes cascade widely):
- `types.ts` — all files depend on this. Validate type changes with `bun run typecheck`
- `state.ts` — PRNG state + game state. Used by all simulation modules
- `constants.ts` — pool limits, world size. Referenced globally
- `pools.ts` — object pools. Affects all spawn/kill operations
- `unit-types.ts` — unit definitions. Affects combat, rendering, and UI

**Detailed change guides** in AGENTS.md files:
- Root `AGENTS.md` — data flow, state management, change procedures, dependency graph
- `src/renderer/AGENTS.md` — VAO/FBO structure, instance data layout
- `src/simulation/AGENTS.md` — tick order, combat branching, reinforcement table
- `src/shaders/AGENTS.md` — `#include` mechanism, shape ID→SDF mapping
- `src/ui/AGENTS.md` — codex pool side effects, demo scenarios

## Coding Conventions

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. Modify only through dedicated functions like `incUnits()`/`decUnits()` in `pools.ts`. Direct external mutation causes type errors
- **beams**: Dynamic array (not pooled) — swap-and-pop for deletion (swap with last element + `.pop()`)
- **Functional/procedural**: No classes; game objects are plain typed objects
- **Japanese UI text**: Menu descriptions and unit abilities are in Japanese
- **Import conventions**: Relative paths + explicit `.ts` extension. No path aliases, no barrel exports
- **Constant placement**: `constants.ts` contains **only constants referenced across multiple layers** (pool sizes, world boundaries, linger times, shape IDs, etc.). Logic-specific multipliers/thresholds used only within a single module (+ its tests) should be defined in that module (e.g., `AMP_DAMAGE_MULT` → `combat.ts`)
- **Dependency rules** (dependency-cruiser): `simulation/` → `state.ts` forbidden (rng/state injected as arguments). `simulation/` → `ui/` forbidden (dependency inversion via callback injection). Validate with `bun run check:deps`
- **TypeScript strict settings**:
  - `verbatimModuleSyntax` — type-only imports must use `import type { X }`
  - `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props (use `prop?: T | undefined`)
  - `noUncheckedIndexedAccess` — array/record index returns `T | undefined`
  - `noImplicitReturns` — all branches must explicitly return
  - `noFallthroughCasesInSwitch` — switch fallthrough is forbidden
  - `noUnusedLocals` / `noUnusedParameters` — unused variables/parameters are errors

- **No defensive fallbacks**: "Just in case" default value returns (scattered `?? defaultValue`), redundant null check layering, and defensive try-catch blocks are forbidden
  - Do not scatter runtime default values for optional type properties → resolve defaults at definition time and make the type required
  - DOM elements should use `getElement()` (throws on missing) in initialization functions, then treat as non-null thereafter. Do not silently ignore with `?.`
  - Function optional parameters should use default parameter syntax (`param = defaultValue`) and avoid `?? defaultValue` in the function body
  - Array index `T | undefined` from `noUncheckedIndexedAccess` is an exception (required by type constraints)

**Type safety notes**:
- `1 - team` returns `number`, not `Team` type → compare with `.team !== u.team` instead
- Pool loop index requires branded type cast: `i as UnitIndex` (also `ParticleIndex`, `ProjectileIndex`)
- `u.target` is `UnitIndex` — `NO_UNIT` (-1) means no target; always check `.alive` on target

## Serena (MCP)

Prefer Serena's LSP tools over Grep/Glob for code analysis and editing:
- Symbol definition lookup and reference tracking → `find_symbol`, `find_referencing_symbols`
- File structure overview → `get_symbols_overview` (avoids reading entire files)
- Renaming → `rename_symbol` (automatically updates all references)
- Code editing → `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`

Use Grep/Glob for: string literal searches, filename pattern searches, non-code files (GLSL, JSON, MD)

## Key Performance Patterns

- **Object pooling**: Pre-allocated arrays; `.alive` flag controls active state. Spawn scans for first dead slot
- **Instanced rendering**: `gl.drawArraysInstanced()` with VAOs. Instance buffer: 9 floats `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride 36 bytes). GLSL `#version 300 es`
- **Spatial hash**: `buildHash()` rebuilds every frame. `getNeighbors(x,y,r)` returns count; results in shared `neighborBuffer` — use immediately, do not copy
