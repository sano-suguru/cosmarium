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

**Pre-commit hook**: `bunx biome check --staged --no-errors-on-unmatched --write && git update-index --again`

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

See `AGENTS.md` files in each directory for detailed change procedures and dependency graphs. Context-specific rules are in `.claude/rules/` (auto-injected by file path).

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

## Key Rules (details in `.claude/rules/`)

- **No classes** — plain typed objects, procedural functions, state mutation via assignment
- **Imports** — relative paths + explicit `.ts` extension, no barrel exports
- **Dependency rules** (`bun run check:deps`): `simulation/` → `state.ts` forbidden, `simulation/` → `ui/` forbidden
- **`types.ts` / `state.ts` changes cascade everywhere** — always validate with `bun run typecheck`
- **GLSL** — GPU-only compilation, no CI validation, test in browser
- **Japanese UI** — menu descriptions and unit abilities in Japanese
- **Serena (MCP)** — コード分析・編集は Serena の LSP ツール優先（`find_symbol`, `get_symbols_overview`, `replace_symbol_body` 等）。Grep/Glob は文字列検索・非コードファイル用

Coding conventions, TypeScript strict settings, Biome rules → `.claude/rules/coding.md`
Testing helpers, PRNG → `.claude/rules/testing.md`
Pool/kill gotchas, spatial hash → `.claude/rules/performance.md`
Change guides (new unit, new shape, new effect) → `.claude/rules/change-guides.md` + `shaders.md`
