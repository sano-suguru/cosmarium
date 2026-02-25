# Copilot Instructions for COSMARIUM

**COSMARIUM** is a real-time space strategy/combat simulation game built with vanilla TypeScript, WebGL 2, and Vite. This file helps Copilot work effectively in this repository.

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

## High-Level Architecture

### Project Structure
```
src/
  main.ts               # Entry point + main game loop
  types.ts              # All TypeScript type definitions (CORE FILE)
  constants.ts          # Pool limits, world size, shader constants
  state.ts              # Mutable game state object (CORE FILE)
  pools.ts              # Object pools: units, particles, projectiles + poolCounts
  colors.ts             # Team colors, trail color tables
  unit-types.ts         # 15 unit type definitions with properties
  shaders/              # GLSL source files (vite-plugin-glsl with #include support)
  renderer/             # WebGL 2: VAO/FBO/buffers, instanced rendering, bloom, minimap
  simulation/           # Game tick logic: spatial hash, spawn/kill, steering, combat, effects
  input/camera.ts       # Camera state, input handling, screen shake
  ui/                   # Codex (unit demo), game controls, HUD
```

### Main Loop (simplified)
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

### State Management
- **state.ts**: Single `const state: State` export. Mutate directly via property assignment. Used by all modules.
- **poolCounts**: Readonly export. Update ONLY via spawn/kill functions (`killUnit`, `killParticle`, `killProjectile`). Direct mutation causes type errors.
- **rng()**: Seeded PRNG (mulberry32) in state.ts closure. Simulation receives as argument (dependency rule).
- **codexOpen**: Flag that affects 4 layers: simulation (skip steer/combat for non-demo units), renderer (lock camera), input (disable controls), main (hide HUD).

## Key Conventions

### Strict TypeScript
- `verbatimModuleSyntax`: Type imports **must** use `import type { X }`
- `noUncheckedIndexedAccess`: Array index access returns `T | undefined` → check or use falsy coalesce
- `exactOptionalPropertyTypes`: Cannot assign `undefined` to optional properties → use `prop?: T | undefined` in types
- `noNonNullAssertion`: Forbidden (`!` operator). Use conditional checks instead.
- `noExplicitAny`: `any` forbidden. Use proper types or `unknown` + type guard.

### Biome Linting (Config in `biome.json`)
- **noConsole**: Only `console.error`/`console.warn` allowed (test files exempt)
- **noForEach**: Use `for...of` loops instead
- **noBarrelFile**: No index.ts barrel exports
- **noExcessiveCognitiveComplexity**: Max complexity 15
- **Line width**: 120 characters
- **Quotes**: Single quotes, always semicolons
- **Shaders excluded**: `src/shaders/**` not linted/formatted (GLSL rules differ)

### Import & Dependency Rules
- **Always**: Relative paths with explicit `.ts` extension. No path aliases, no barrel exports.
- **Example**: `import { spawn } from './spawn.ts';` not `import { spawn } from './index';`
- **Dependency constraints** (dependency-cruiser enforced):
  - `simulation/` → `state.ts` forbidden (inject rng/state as arguments)
  - `simulation/` → `ui/` forbidden (inject callbacks to invert dependency)

### Functional Style
- No classes. Game objects are plain typed objects.
- State mutations via assignment (not methods).
- Most operations are procedural functions (spawn, kill, update).

## CORE FILES (Changes Here Cascade Widely)

When modifying these, expect wave effects:
- **types.ts**: All files depend. Type-only changes. Validate with `bun run typecheck`.
- **state.ts**: PRNG state, game state. All simulation modules use.
- **constants.ts**: Pool limits, world dimensions. Referenced everywhere.
- **pools.ts**: Object pools. Affects spawn/kill throughout.
- **unit-types.ts**: Unit definitions. Affects combat, rendering, UI.

For **3+ files spanning multiple modules**, create a plan before implementing.

## Testing

- **Framework**: Vitest with Node environment
- **Location**: `src/**/*.test.ts`
- **Helpers**: `src/__test__/pool-helper.ts`
  - `resetPools()`: Reset all pools to dead state, zero poolCounts
  - `resetState()`: Reset game state to menu defaults
  - `spawnAt(team, type, x, y)`: Mock Math.random for deterministic spawning
- **Pattern**: Always `afterEach(() => { resetPools(); resetState(); vi.restoreAllMocks(); })`
- **UI/Camera mocks**: Use `vi.mock()` to stub UI/camera dependencies in simulation tests

## Critical Gotchas

| Issue | Details |
|-------|---------|
| `neighborBuffer` | Shared buffer updated by `getNeighbors()`. **Use immediately**, do not copy. Valid only after `buildHash()`. |
| `codexOpen` impact | Affects 4 layers: skip non-demo unit steer/combat, lock camera, disable input, skip HUD. See main loop. |
| GLSL compilation | GPU-only. Runtime only. No CI validation. Test shader changes in browser. |
| Pool mutation | Never directly assign `poolCounts`. Use `killUnit()`, `killParticle()`, `killProjectile()` only. |
| Data before kill | `killUnit()` returns a snapshot (safe). For particle/projectile, save values to locals **before** calling `kill()` — kill reuses slot immediately. Use `destroyUnit()` for unit kill + explosion combo. |
| Team helper | Use `enemyTeam()` from types.ts, not `1 - team`. Returns `Team` type, not `number`. |
| Branded indices | Pool loops need cast: `i as UnitIndex` (also ParticleIndex, ProjectileIndex). |

## Common Tasks

### Add a New Unit Type
1. Add to `unit-types.ts` (TYPES array)
2. If new flags needed: add to `types.ts`
3. Add colors to `colors.ts`
4. Add combat logic to `simulation/combat.ts`
5. Add steering (if special) to `simulation/steering.ts`
6. If new properties: handle in `simulation/spawn.ts`
7. Add codex entry to `ui/codex.ts`
8. If new shape: add SDF to `src/shaders/includes/sdf.glsl` + update shape ID in `src/shaders/main.frag.glsl`

### Add an Effect
Add function to `simulation/effects.ts` → import at call site

### Change Rendering
See `src/renderer/AGENTS.md` for VAO/FBO structure, instance data layout

### Change Simulation Tick Order
See `src/simulation/AGENTS.md` for step breakdown, combat branching, reinforcement table

### Change Shader
See `src/shaders/AGENTS.md` for #include mechanism, shape ID→SDF mapping

### Change UI/Codex
See `src/ui/AGENTS.md` for pool side effects, demo scenarios

## PRNG

- `rng()` in state.ts: Deterministic (mulberry32-based)
- `seedRng(seed)`: Set seed for reproducible behavior (testing)
- Simulation receives `rng` as function argument
- Camera shake in main.ts uses `Math.random()` (not seeded)

## Game Mode

Only **Infinite** mode. Persistent space war simulation.

## Other References

- **AGENTS.md**: Detailed data flow, state rules, multi-file change procedures, dependency graph
- **CLAUDE.md**: Full architecture, performance patterns, shader shape ID table, anti-patterns

When unsure, check AGENTS.md (root) or module-specific AGENTS.md files (renderer, simulation, shaders, ui).
