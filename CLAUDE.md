# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese**.

## Project Overview

**COSMARIUM** — autonomous swarm fleet battle simulation. Units fight autonomously via Boids + engagement AI; player designs/composes fleets and spectates. TypeScript + WebGL 2 + Preact (UI layer only). Vite + Bun. Deployed to Cloudflare Workers (Hono).

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
  fleet-cost.ts      # SORTED_TYPE_INDICES, cost helpers
  battle-tracker.ts  # Battle mode elapsed/win/result aggregation
  melee-tracker.ts   # Melee mode (N-team) elapsed/win/result aggregation
  screen-effects.ts  # Post-process screen effect parameters
  shaders/           # GLSL (vite-plugin-glsl, #include)
  renderer/          # WebGL 2 rendering pipeline
  simulation/        # Game logic (spatial hash, combat-*, steering)
  input/camera.ts    # Camera + pointer/keyboard input
  ui/                # Preact components + CSS Modules (Codex, HUD, game controls)
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
      → [if !codexOpen] production (battle/melee) or reinforce (spectate) + win check
      → [if codexOpen] updateCodexDemo()
  → render()
      → GPU buffer upload → drawArraysInstanced
      → bloom (H/V blur) → composite
      → minimap [hidden if codexOpen]
```

### codexOpen State

Affects 4 layers when toggled: simulation (skip steer/combat for non-demo units, skip reinforce), renderer (lock camera), input (disable controls), main (hide HUD). Codex spawns real units via `spawnUnit()` — opens with `clearAllPools()` to reset pool state, restores camera via `snapshotCamera`/`restoreCamera`.

### Game Modes & BattlePhase

`GameState`: `'menu' | 'compose' | 'play' | 'result'` — UI-level state in `state.ts`.

`BattlePhase` (in `GameLoopState`, passed to `stepOnce()`): `'spectate' | 'battle' | 'melee' | 'battleEnding' | 'meleeEnding' | 'aftermath'`
- **Spectate**: AI vs AI, no player fleet
- **Battle**: Player fleet (team 0) vs enemy (team 1), production-based (mothership + slots)
- **Melee**: N-team free-for-all (2–5 teams via `activeTeamCount`), uses `melee-tracker.ts`

Phase transitions: `main.ts` callbacks → `battle-tracker`/`melee-tracker` → `'aftermath'` → `GameState = 'result'`

## Code Review Rules

- **構造的修正のみ** — コメント追加だけの修正は禁止。すべての指摘は根本原因に対する構造的な変更で解決する
- **fail-fast 原則** — 不変条件違反は必ず `throw`。`console.warn` への緩和は禁止
- **ファイル行数制限** — 通常ファイル 300 行、型定義ファイル 600 行。超過時はコメント/空白削除ではなくモジュール分割で対応
- **変更後は必ず検証** — コード変更後は `bun run check` を実行し、全チェックを通す

## Key Rules (details in `.claude/rules/`)

- **レイヤー分離** — シミュレーション/レンダリング層はクラスなし・手続き的・依存ゼロを維持。UI 層は Preact + CSS Modules
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
