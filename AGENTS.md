# AGENTS.md — COSMARIUM

> Guidance for AI agents working on this codebase. Source of truth is always the source code.

**COSMARIUM** is a real-time space strategy/combat simulation game built with vanilla TypeScript, WebGL 2, and Vite. No UI framework. Zero production dependencies.

## Language

Always respond in **Japanese** (日本語で返答すること). Refer to `CLAUDE.md` for Claude Code guidance.

## Build, Test, and Lint Commands

All commands use **Bun** as the package manager.

```bash
# Development
bun install                      # Install dependencies
bun run dev                      # Dev server at http://localhost:5173

# Code quality checks
bun run typecheck                # TypeScript strict mode check
bun run lint                     # Biome lint (read-only)
bun run lint:fix                 # Biome lint with auto-fix
bun run format                   # Biome format (write)
bun run format:check             # Biome format check (read-only)

# Build & testing
bun run build                    # Production build
bun run test                     # Vitest watch mode
bun run test:run                 # Vitest single run (all tests)
bunx vitest run src/path/to.test.ts  # Single test file

# Code quality
bun run knip                     # Unused export detection
bun run cpd                      # Copy-paste detection (jscpd)
bun run similarity               # Code similarity detection (threshold: 0.92, min: 7 lines)
bun run check:deps               # Dependency rule validation (dependency-cruiser)

# Comprehensive check (pre-commit, CI)
bun run check                    # Runs all checks: typecheck + biome + knip + cpd + similarity + test + check:deps
```

**Pre-commit hook** automatically runs: `biome check --staged --write`

## Project Structure

```
src/
├── main.ts               # Entry point + main game loop
├── types.ts              # All TypeScript type definitions (CORE FILE)
├── constants.ts          # Pool limits, WORLD_SIZE, shader constants
├── state.ts              # Mutable game state object (CORE FILE)
├── pools.ts              # Object pools: units, particles, projectiles + poolCounts
├── beams.ts              # beam/trackingBeam dynamic arrays
├── colors.ts             # Team colors, trail color tables
├── unit-types.ts         # 15 unit type definitions with properties
├── fleet-cost.ts         # DEFAULT_BUDGET, SORTED_TYPE_INDICES, cost helpers
├── battle-tracker.ts     # Battle mode elapsed/win/result aggregation
├── melee-tracker.ts      # Melee mode (N-team) elapsed/win/result aggregation
├── drain-accumulator.ts  # drainAccumulator() — fixed-step accumulator logic
├── interpolation.ts      # savePrevPositions / setInterpAlpha for render interpolation
├── swap-remove.ts        # swap-and-pop helper for dynamic arrays
├── fixed-point.ts        # Fixed-point math (deterministic)
├── fixed-rng.ts          # Fixed-point RNG
├── fixed-trig.ts         # Fixed-point trig (sin/cos tables)
├── shaders/              # GLSL source files (vite-plugin-glsl with #include support)
├── renderer/             # WebGL 2: VAO/FBO/buffers, instanced rendering, bloom, minimap
├── simulation/           # Game tick logic: spatial hash, spawn/kill, steering, combat, effects
├── input/camera.ts       # Camera state, input handling, screen shake
└── ui/                   # Codex, fleet-compose, HUD, battle-result
```

## Main Loop (simplified)

```
frame() → dt clamp(0.05) → camera update + decay
  → update(dt)  [split into max 8 substeps if dt > 1/60s]
      → buildHash() [spatial acceleration]
      → per unit: steer → combat → trail + effects
      → reflector pass → projectiles → particles → beams
      → [if !codexOpen] reinforce() + win check
      → [if codexOpen] updateCodexDemo() [demo-only units move]
  → render()
      → GPU buffer upload → drawArraysInstanced
      → bloom (H/V blur) → composite
      → minimap [hidden if codexOpen]
```

## State Management

- **state.ts**: Single `const state: State` export — `GameState` (`'menu' | 'compose' | 'play' | 'result'`), `codexOpen`, PRNG, etc. Mutate via property assignment.
- **GameLoopState** (`simulation/update.ts`): Holds `battlePhase: BattlePhase` and `activeTeamCount`. Passed into `stepOnce()` each frame; not in `state.ts`.
- **BattlePhase**: `'spectate' | 'battle' | 'melee' | 'battleEnding' | 'meleeEnding' | 'aftermath'`. Controls which trackers and reinforce logic run.
- **poolCounts**: Readonly export. Update ONLY via spawn/kill functions (`killUnit`, `killParticle`, `killProjectile`). Direct mutation causes type errors.
- **rng()**: Seeded PRNG (mulberry32) in state.ts closure. Simulation receives as argument (dependency rule).
- **codexOpen**: Flag that affects 4 layers: simulation (skip steer/combat for non-demo units), renderer (lock camera), input (disable controls), main (hide HUD).

## Dependency Rules (dependency-cruiser)

Enforced in `.dependency-cruiser.cjs`. Violations cause errors via `bun run check:deps`:
- `simulation/` → `state.ts` forbidden — inject rng/state as arguments
- `simulation/` → `ui/` forbidden — inject callbacks to invert dependency
- `worker/` → `src/` forbidden — worker is server-side only
- `codex.ts` → `game-control.ts` forbidden — circular dependency

## Core Modules & Change Impact

`types.ts` — all files depend (changes cascade everywhere). Validate with `bun run typecheck`.
`constants.ts`/`state.ts`/`pools.ts`/`colors.ts`/`unit-types.ts` — also widely depended on. Constant values: see `src/constants.ts`.

For **3+ files spanning multiple modules**, create a plan before implementing.

## Data Flow Overview

See `src/simulation/AGENTS.md` for detailed tick order. Summary:

- Main loop: Runs only when `gameState === 'play'`. dt clamped via `Math.min(dt, 0.05)`
- main.ts `drainAccumulator` uses accumulator pattern to call `stepOnce(SIM_DT)` at fixed dt intervals (max 8 steps/frame) → each step: hash → steer → combat → effects → reinforce
- When `codexOpen`: Affects simulation/renderer/input/main (4 layers). Skips steer/combat for non-demo units, skips reinforce, locks camera, disables input
- RNG: main.ts selects `state.rng` (seeded) or `demoRng` and passes into `update()` as argument. All simulation code receives rng via arguments (dependency rule)

## Change Guides

### Add a New Unit Type
`unit-types.ts` → `types.ts` (if new flags) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts` (if special movement) → `simulation/spawn.ts` (if new properties) → `ui/codex.ts` → `src/shaders/main.frag.glsl` (if new shape)

### Add an Effect
Add function to `simulation/effects.ts` → import at call site

### Other Changes
Rendering → `src/renderer/AGENTS.md`, Simulation → `src/simulation/AGENTS.md`, Shaders → `src/shaders/AGENTS.md`, UI → `src/ui/AGENTS.md`

## Key Conventions

### Strict TypeScript
- `verbatimModuleSyntax`: Type imports **must** use `import type { X }`
- `noUncheckedIndexedAccess`: Array index access returns `T | undefined` → check or use falsy coalesce
- `exactOptionalPropertyTypes`: Cannot assign `undefined` to optional properties → use `prop?: T | undefined` in types
- `noNonNullAssertion`: Forbidden (`!` operator). Use conditional checks instead.
- `noExplicitAny`: `any` forbidden. Use proper types or `unknown` + type guard.
- `noImplicitReturns`: All code paths must return a value.

### Biome Linting (Config in `biome.json`)
- **noConsole**: Only `console.error`/`console.warn` allowed (test files exempt)
- **noForEach**: Use `for...of` loops instead
- **noBarrelFile**: No index.ts barrel exports
- **noExcessiveCognitiveComplexity**: Max complexity 15
- **noExcessiveLinesPerFile**: Max 600 lines (test files exempt)
- **Line width**: 120 characters
- **Quotes**: Single quotes, always semicolons
- **Shaders excluded**: `src/shaders/**` not linted/formatted (GLSL rules differ)

### Import Rules
- **Always**: Relative paths with explicit `.ts` extension. No path aliases, no barrel exports.
- **Example**: `import { spawn } from './spawn.ts';` not `import { spawn } from './index';`

### Functional Style
- No classes. Game objects are plain typed objects.
- State mutations via assignment (not methods).
- Most operations are procedural functions (spawn, kill, update).

### No Defensive Fallbacks
No scattered `?? defaultValue`, redundant null checks, or defensive try-catch. Resolve defaults at definition time; make types required. DOM elements: use `getElement()` (throws on missing), treat as non-null thereafter.

### State & Pool Conventions
- **state.ts**: Single export object. Mutate via property assignment.
- **poolCounts**: Readonly export. External direct mutation causes type errors. Always use `killUnit`/`killParticle`/`killProjectile` etc.
- **spawn/kill**: Unit/Projectile scan from pool start for first dead slot. Particle uses LIFO free stack (Uint16Array) for fast allocation. All kill functions have double-kill guard.
- **Adding new object types**: Add pool array + counter to `pools.ts`, add limit constant to `constants.ts`.
- **Pool accessors**: `unit(i)`/`particle(i)`/`projectile(i)` via pools.ts aggregate functions. Centralizes `noUncheckedIndexedAccess` undefined checks.

## Testing

- **Framework**: Vitest with Node environment
- **Location**: `src/**/*.test.ts`
- **Helpers**: `src/__test__/pool-helper.ts`
  - `resetPools()`: Reset all pools to dead state, zero poolCounts
  - `resetState()`: Reset game state to menu defaults
  - `spawnAt(team, type, x, y)`: Mock Math.random for deterministic spawning
  - `fillUnitPool()`: Fill entire unit pool
  - `makeGameLoopState()`: Create GameLoopState for testing
- **Pattern**: Always `afterEach(() => { resetPools(); resetState(); vi.restoreAllMocks(); })`
- **UI/Camera mocks**: Use `vi.mock()` to stub UI/camera dependencies in simulation tests
- **RNG determinism**: Use `seedRng(12345)` to ensure reproducible behavior

## PRNG

- `rng()` in state.ts: Deterministic (mulberry32-based)
- `seedRng(seed)`: Set seed for reproducible behavior (testing)
- Simulation receives `rng` as function argument
- Camera shake in main.ts uses `Math.random()` (not seeded)

## Game Modes

- **Spectate** (`battlePhase = 'spectate'`): AI vs AI, no player fleet — equivalent to the former "Infinite" mode
- **Battle** (`battlePhase = 'battle'`): Player fleet (team 0) vs enemy fleet (team 1), budget-limited via `fleet-cost.ts` (`DEFAULT_BUDGET = 200`)
- **Melee** (`battlePhase = 'melee'`): N-team free-for-all (2–5 teams, `activeTeamCount`). Uses `melee-tracker.ts` for per-team elimination events
- Phase transitions flow through `main.ts` callbacks → `battle-tracker`/`melee-tracker` → `'aftermath'` → `GameState = 'result'`

## Work Guidelines

### Separate Investigation from Implementation

Investigation (reading files, understanding dependencies) and implementation are separate phases. Don't read all files before starting — read only what's needed.

#### Subtask Delegation Exclusivity Rules (Important)

When delegating investigation to subtasks (explore/librarian etc.):

1. **Do not investigate the same target yourself.** "Also checking directly in parallel" is forbidden. Duplicate reads/greps of the same files wastes context.
2. **Collect results before deciding.** Retrieve via background_output, then supplement with additional direct tool calls if needed.
3. **Working on independent tasks while waiting** is allowed. "Independent" means tasks that don't overlap with the delegated investigation (e.g., todo management, type definition drafts).

"Parallelize EVERYTHING" applies to **different targets** in parallel — not duplicate investigation of the same target.

### Tasks Requiring a Plan

Create a plan before implementing if any of these apply:

| Condition | Reason |
|-----------|--------|
| Changes spanning 3+ modules | See Change Guides dependency chains above |
| Changes to `types.ts` or `state.ts` | Cascades to all files |
| Adding a new unit | Requires 6–8 file chain changes |
| Shader changes | No type safety. Browser-only verification |

### Division Unit Guidelines

- Type definition additions → validate with `bun run typecheck` → proceed
- Logic changes → validate with `bun run test:run` → proceed
- Shader changes → verify visually in browser → proceed

Maintain passing `bun run typecheck` at each unit. Don't change multiple modules at once and verify only at the end.

## Critical Gotchas

| Issue | Details |
|-------|---------|
| `neighborBuffer` | Shared buffer updated by `getNeighbors()`. **Use immediately**, do not copy. Valid only after `buildHash()`. |
| `codexOpen` impact | Affects 4 layers: skip non-demo unit steer/combat, lock camera, disable input, skip HUD. See main loop. |
| GLSL compilation | GPU-only. Runtime only. No CI validation. Test shader changes in browser. |
| Pool mutation | Never directly assign `poolCounts`. Use `killUnit()`, `killParticle()`, `killProjectile()` only. |
| Data before kill | `killUnit()` returns a snapshot (safe). For particle/projectile, save values to locals **before** calling `kill()` — kill reuses slot immediately. Use `destroyUnit()` for unit kill + explosion combo. |
| Team helper | In N-team (Melee), enemy check is `o.team !== u.team`. Never use `1 - team`. |
| Branded indices | Pool loops need cast: `i as UnitIndex` (also ParticleIndex, ProjectileIndex). |
| Codex snapshot | `snapshotPools()`/`restorePools()` are shallow copy. Written back via Object.assign. |
| Input events | Pointer Events unified (mouse/touch). canvas/minimap have `touch-action: none`. Pinch zoom tracks 2 fingers via `activePointers` Map. |

Simulation-specific gotchas (`destroyUnit()` preference, `beams` swap-and-pop etc.) → see `src/simulation/AGENTS.md`. Shader-specific (GLSL runtime compilation, `vite-plugin-glsl` `#include` expansion etc.) → see `src/shaders/AGENTS.md`.

## Other References

- **AGENTS.md** (subdirectories): Detailed data flow, state rules, multi-file change procedures per module
- **CLAUDE.md**: Full architecture, performance patterns, shader shape ID table, anti-patterns

When unsure, check this file or module-specific AGENTS.md files (renderer, simulation, shaders, ui).
