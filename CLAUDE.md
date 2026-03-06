# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese**.

## Project Overview

**COSMARIUM** — autonomous swarm fleet battle simulation. Units fight autonomously via Boids + engagement AI; player designs/composes fleets and spectates. Vanilla TypeScript + WebGL 2. Vite + Bun. No UI framework. Zero production dependencies. Deployed to Cloudflare Workers (Hono).

## Development

```bash
bun install          # Install dependencies
bun run dev          # Dev server (localhost:5173)
bun run dev:worker   # Cloudflare Workers dev server (wrangler)
bun run build        # Production build
bun run deploy       # Build + wrangler deploy
bun run typecheck    # TypeScript strict mode (src + worker)
bun run lint:fix     # Biome lint + auto-fix
bun run format       # Biome format (write)
bun run format:check # Biome format check (read-only)
bun run knip         # Unused export detection
bun run cpd          # Copy-paste detection (jscpd)
bun run similarity   # Code similarity detection (threshold: 0.92, min: 7 lines)
bun run check:deps   # Dependency rule validation (dependency-cruiser)
bun run test         # Vitest watch mode
bun run test:run     # Vitest single run (all tests)
bun run bench        # Vitest benchmark
bun run check        # All checks (typecheck + biome ci + knip + cpd + similarity + vitest + check:deps)
```

**Single test file**: `bunx vitest run src/path/to.test.ts`

**Biome**: Pre-commit hook runs `biome check --staged --write`. Key rules:
- `noConsole: error` — only `console.error`/`console.warn` allowed (test files exempt)
- `noNonNullAssertion: error` — `!` forbidden
- `noExplicitAny: error` — use proper types or `unknown` + type guard
- `noForEach: error` — use `for...of`
- `noBarrelFile: error` — no barrel exports
- `noExcessiveCognitiveComplexity: error` — max 15
- `noExcessiveLinesPerFile: error` — max 600 lines (test files exempt)
- Line width 120, single quotes, always semicolons
- `src/shaders/**` excluded from lint/format (GLSL)

**Testing**: Vitest (`src/**/*.test.ts`). Helpers in `src/__test__/pool-helper.ts`:
- `resetPools()` / `resetState()` — reset pools/state to defaults
- `spawnAt(team, type, x, y)` — mock `Math.random` for deterministic spawning
- `fillUnitPool()` — fill entire unit pool
- `makeGameLoopState()` — create `GameLoopState` for testing
- Standard afterEach: `resetPools(); resetState(); vi.restoreAllMocks();`

**PRNG**: `rng()` (`state.ts`) — deterministic mulberry32. Fix seed with `seedRng(seed)` in tests. Camera shake uses `Math.random()` (not seeded). Codex demo uses `demoRng` (`Math.random`-based, intentionally non-deterministic).

## Architecture

```
src/
  main.ts            # Entry point + main loop
  types.ts           # All TypeScript interfaces (changes cascade everywhere)
  constants.ts       # Pool limits, WORLD_SIZE, shape IDs
  state.ts           # Mutable game state + PRNG
  pools.ts           # Object pools + poolCounts
  beams.ts           # beam/trackingBeam dynamic arrays
  colors.ts          # Team/trail color tables
  unit-types.ts      # Unit type definitions
  fleet-cost.ts      # DEFAULT_BUDGET, SORTED_TYPE_INDICES, cost helpers
  battle-tracker.ts  # Battle mode elapsed/win/result aggregation
  melee-tracker.ts   # Melee mode (N-team) elapsed/win/result aggregation
  screen-effects.ts  # Post-process screen effect parameters
  shaders/           # GLSL (vite-plugin-glsl, #include)
  renderer/          # WebGL 2 rendering pipeline
  simulation/        # Game logic (spatial hash, combat-*, steering)
  input/camera.ts    # Camera + pointer/keyboard input
  ui/                # Codex, HUD, game controls
worker/
  index.ts           # Cloudflare Workers edge server (Hono + CSP headers)
```

See `AGENTS.md` files in each directory for change procedures and dependency graphs.

### Main Loop Flow

```
frame() → dt clamp(0.05) → camera update + decay
  → update(dt)  [split into max 8 substeps if dt > 1/60s]
      → buildHash() [spatial acceleration]
      → per unit: steer → combat → trail + effects
      → reflector pass → projectiles → particles → beams
      → [if !codexOpen] reinforce() + win check
      → [if codexOpen] updateCodexDemo()
  → render()
      → GPU buffer upload → drawArraysInstanced
      → bloom (H/V blur) → composite
      → minimap [hidden if codexOpen]
```

### codexOpen State

Affects 4 layers when toggled: simulation (skip steer/combat for non-demo units, skip reinforce), renderer (lock camera), input (disable controls), main (hide HUD). Codex spawns real units via `spawnUnit()` — uses snapshot/restore (`snapshotPools`/`restorePools`) to save and restore pool state.

### Game Modes & BattlePhase

`GameState`: `'menu' | 'compose' | 'play' | 'result'` — UI-level state in `state.ts`.

`BattlePhase` (in `GameLoopState`, passed to `stepOnce()`): `'spectate' | 'battle' | 'melee' | 'battleEnding' | 'meleeEnding' | 'aftermath'`
- **Spectate**: AI vs AI, no player fleet
- **Battle**: Player fleet (team 0) vs enemy (team 1), budget-limited (`DEFAULT_BUDGET = 200`)
- **Melee**: N-team free-for-all (2–5 teams via `activeTeamCount`), uses `melee-tracker.ts`

Phase transitions: `main.ts` callbacks → `battle-tracker`/`melee-tracker` → `'aftermath'` → `GameState = 'result'`

## Change Guides

### Add a New Unit Type
`unit-types.ts` → `types.ts` (if new flags) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts` (if special movement) → `simulation/spawn.ts` (if new properties) → `ui/codex.ts` → `src/shaders/main.frag.glsl` (new shape)

### Add a New Shape
Shape IDs are **append-only** — never reuse or reassign existing IDs. Units 0–18, Effects 19+.
1. `includes/shape-count.glsl`: increment `NUM_SHAPES`
2. `main.frag.glsl`: add entry to 4 arrays (RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT)
3. Add SDF in `unit-shapes.glsl` or `effect-shapes.glsl` with `// [SHAPE:ID Name]` marker
4. `unit-types.ts`: set `shape` to new ID
5. Verify: `bunx vitest run src/shaders/shape-sync.test.ts` + browser visual check

### Add an Effect
Add function to `simulation/effects.ts` → import at call site.

## Change Philosophy

Favor structural correctness over minimal diffs. Make all necessary changes — don't minimize with local patches. Suggest improvements when found.

## Coding Conventions

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. Modify only via `incUnits()`/`decUnits()` etc.
- **Pool accessors**: `unit(i)`/`particle(i)`/`projectile(i)` — centralized `noUncheckedIndexedAccess` checks
- **beams**: Dynamic array — swap-and-pop for deletion (order not preserved)
- **No classes**: Game objects are plain typed objects
- **Import**: Relative paths + explicit `.ts` extension. No path aliases, no barrel exports
- **Constant placement**: `constants.ts` for multi-module constants only. Single-module thresholds stay local
- **Japanese UI**: Menu descriptions and unit abilities in Japanese

### Dependency Rules (dependency-cruiser enforced)

- `simulation/` → `state.ts` forbidden — inject rng/state as arguments
- `simulation/` → `ui/` forbidden — inject callbacks to invert dependency
- `worker/` → `src/` forbidden — worker is server-side only

Validate with `bun run check:deps`.

### TypeScript Strict (non-obvious)

- `verbatimModuleSyntax` — type imports must use `import type { X }`
- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props (use `prop?: T | undefined`)
- `noUncheckedIndexedAccess` — array/record index returns `T | undefined`
- `noUnusedLocals` / `noUnusedParameters` — unused variables are errors

### No Defensive Fallbacks

No scattered `?? defaultValue`, redundant null checks, or defensive try-catch. Resolve defaults at definition time; make types required. DOM elements: use `getElement()` (throws on missing), treat as non-null thereafter.

### Type Safety Notes

- N-team 対応: 敵判定は `o.team !== u.team` パターンを使用（2-team 前提の `1 - team` は不可）
- `Team` 型は 0-4 を許容するが、実行時のチーム数は `gameLoopState.activeTeamCount` で決まる（SPECTATE/BATTLE=2, MELEE=2-5）
- `MAX_TEAMS` / `Team` / `TeamCounts` は `types.ts` に集約。`TeamCounts` は `MAX_TEAMS` から自動導出
- Pool loops require `i as UnitIndex` cast (also `ParticleIndex`, `ProjectileIndex`)
- `u.target` of `NO_UNIT` (-1) means no target; always check `.alive`

## Key Performance Patterns

- **Object pooling**: Pre-allocated arrays + `.alive` flag. Unit/Projectile: linear scan for first dead slot. Particle: LIFO free stack (Uint16Array) for fast allocation. All kill functions have double-kill guard.
- **Instanced rendering**: `drawArraysInstanced()` + VAO. Instance buffer: 9 floats `[x,y,size,r,g,b,alpha,angle,shapeID]` (stride 36B)
- **Spatial hash**: `buildHash()` rebuilds every frame. `getNeighbors()` results in shared `neighborBuffer` — use immediately, do not copy. Only valid after `buildHash()`.

## Critical Gotchas

| Issue | Details |
|-------|---------|
| `destroyUnit()` vs `killUnit()` | Always use `destroyUnit()` for unit kill + explosion combo — it takes a snapshot internally. `killUnit()` returns a snapshot (safe to use after call). For particle/projectile, save values to locals **before** `kill()` — kill may reuse the slot immediately. |
| `neighborBuffer` | Shared buffer updated by `getNeighbors()`. Use immediately, do not copy. |
| GLSL compilation | GPU-only, runtime only. No CI validation. Test shader changes in browser. |
| Pool mutation | Never directly assign `poolCounts`. Use spawn/kill functions only. |
| `codex.ts` → `game-control.ts` | Reverse import is circular dependency — forbidden. |

## Serena (MCP)

Prefer Serena's LSP tools over Grep/Glob for code analysis and editing:
- `find_symbol` / `find_referencing_symbols` — definition and reference tracking
- `get_symbols_overview` — file structure without reading entire files
- `rename_symbol` — rename with automatic reference updates
- `replace_symbol_body` / `insert_after_symbol` / `insert_before_symbol` — symbol-level editing

Use Grep/Glob for: string literal searches, filename patterns, non-code files (GLSL, JSON, MD).
