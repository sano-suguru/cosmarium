# CLAUDE.md

## Language

Always respond in **Japanese**.

## Project Overview

**COSMARIUM** — real-time space strategy simulation. Vanilla TypeScript + HTML5 Canvas + WebGL 2. Vite + Bun. No UI framework. Zero production dependencies.

## Development

```bash
bun install          # Install dependencies
bun run dev          # Dev server (localhost:5173)
bun run build        # Production build
bun run typecheck    # TypeScript strict mode
bun run lint:fix     # Biome lint + auto-fix
bun run format       # Biome format (write)
bun run format:check # Biome format check (read-only)
bun run knip         # Unused export detection
bun run cpd          # Copy-paste detection
bun run test         # Vitest watch mode
bun run test:run     # Vitest single run
bun run bench        # Vitest benchmark
bun run check        # All checks (typecheck + biome ci + knip + cpd + similarity + vitest + check:deps)
```

**Biome**: Pre-commit hook runs `biome check --staged --write`. Pitfall rules:
- `noConsole: error` — only `console.error`/`console.warn` allowed
- `noNonNullAssertion: error` — `!` forbidden
- `noForEach: error` — use `for...of`

**Testing**: Vitest (`src/**/*.test.ts`). Helpers in `src/__test__/pool-helper.ts`. Standard afterEach: `resetPools(); resetState(); vi.restoreAllMocks();`

**PRNG**: `rng()` (`state.ts`) — deterministic mulberry32. Fix seed with `seedRng(seed)` in tests.

## Architecture

```
src/
  main.ts            # Entry point + main loop
  types.ts           # All TypeScript interfaces
  constants.ts       # Pool limits, WORLD_SIZE, shape IDs
  state.ts           # Mutable game state + PRNG
  pools.ts           # Object pools + poolCounts
  colors.ts          # Team/trail color tables
  unit-types.ts      # Unit type definitions
  shaders/           # GLSL (vite-plugin-glsl, #include)
  renderer/          # WebGL 2 rendering pipeline
  simulation/        # Game logic (spatial hash, combat-*, steering)
  input/camera.ts    # Camera + pointer/keyboard input
  ui/                # Codex, HUD, game controls
```

See `AGENTS.md` files in each directory for change procedures and dependency graphs.

## Change Philosophy

Favor structural correctness over minimal diffs. Make all necessary changes — don't minimize with local patches. Suggest improvements when found.

## Coding Conventions

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. Modify only via `incUnits()`/`decUnits()` etc.
- **beams**: Dynamic array — swap-and-pop for deletion
- **No classes**: Game objects are plain typed objects
- **Import**: Relative paths + explicit `.ts` extension. No path aliases, no barrel exports
- **Constant placement**: `constants.ts` for multi-module constants only. Single-module thresholds stay local
- **Dependency rules**: `simulation/` → `state.ts` forbidden (argument injection). `simulation/` → `ui/` forbidden (callback injection). Validate with `bun run check:deps`
- **Japanese UI**: Menu descriptions and unit abilities in Japanese

**TypeScript strict (non-obvious)**:
- `verbatimModuleSyntax` — type imports must use `import type { X }`
- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props (use `prop?: T | undefined`)
- `noUncheckedIndexedAccess` — array/record index returns `T | undefined`

**No defensive fallbacks**: No scattered `?? defaultValue`, redundant null checks, or defensive try-catch. Resolve defaults at definition time; make types required. DOM elements: use `getElement()` (throws on missing), treat as non-null thereafter.

**Type safety notes**:
- `1 - team` returns `number` → compare with `.team !== u.team`
- Pool loops require `i as UnitIndex` cast
- `u.target` of `NO_UNIT` (-1) means no target; always check `.alive`

## Key Performance Patterns

- **Object pooling**: Pre-allocated arrays + `.alive` flag. Spawn scans for first dead slot
- **Instanced rendering**: `drawArraysInstanced()` + VAO. Instance buffer: 9 floats `[x,y,size,r,g,b,alpha,angle,shapeID]` (stride 36B)
- **Spatial hash**: `buildHash()` rebuilds every frame. `getNeighbors()` results in shared `neighborBuffer` — use immediately, do not copy

## Serena (MCP)

Prefer Serena's LSP tools over Grep/Glob for code analysis and editing:
- `find_symbol` / `find_referencing_symbols` — definition and reference tracking
- `get_symbols_overview` — file structure without reading entire files
- `rename_symbol` — rename with automatic reference updates
- `replace_symbol_body` / `insert_after_symbol` / `insert_before_symbol` — symbol-level editing

Use Grep/Glob for: string literal searches, filename patterns, non-code files (GLSL, JSON, MD).
