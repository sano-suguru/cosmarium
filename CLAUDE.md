# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese** (日本語で返答すること).

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
- `noNonNullAssertion: error` — `!`非null断言禁止
- `noForEach: error` — `forEach`禁止（for-ofを使用）
- `noExcessiveCognitiveComplexity: error` — 最大複雑度15
- `noNestedTernary: error`, `noParameterAssign: error`
- `src/shaders/**` excluded from Biome

**Testing** ([Vitest](https://vitest.dev/)): `src/**/*.test.ts`, `environment: 'node'`, `restoreMocks: true`. Single test: `bunx vitest run src/path/to.test.ts`.

Helper utilities in `src/__test__/pool-helper.ts`:
- `resetPools()` — resets all pools to dead state and zeroes poolCounts
- `resetState()` — resets game state to menu defaults
- `spawnAt(team, type, x, y)` — 固定RNG `() => 0` を引数注入して確定的にユニット生成

**テストの定型パターン**: `afterEach(() => { resetPools(); resetState(); vi.restoreAllMocks(); })`。simulation テストでは `vi.mock()` で UI/camera 依存を排除する。

GLSL shaders are imported via `vite-plugin-glsl` (`#include` directives). Shared SDF functions: `src/shaders/includes/sdf.glsl`.

**PRNG**: `rng()` (`state.ts`) — mulberry32ベースの決定論的乱数。`seedRng(seed)` でシード固定可能（テスト用）。シミュレーション内では`rng()`を使用。`main.ts`の`frame()`内カメラシェイク揺れ計算は`Math.random()`（シード制御対象外）。

**similarity-ts**: `bun run similarity` — コード類似度検出（閾値0.92、最小7行）。`check`に含まれる。

## Game Mode

Infinite モードのみ。永続的な宇宙戦争シミュレーション。

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

**Main loop**: `frame()` → camera lerp/shake → `update(dt*timeScale)` → `renderFrame()`。詳細はroot `AGENTS.md`「Data Flow概要」参照。

**Core files** (変更は広範囲に波及):
- `types.ts` — 全ファイルが依存。型変更は`bun run typecheck`で検証
- `state.ts` — PRNG状態+ゲーム状態。全simulationモジュールが使用
- `constants.ts` — プール上限、ワールドサイズ。全体参照
- `pools.ts` — オブジェクトプール。spawn/kill全体に影響
- `unit-types.ts` — ユニット定義。combat、rendering、UIに影響

**Detailed change guides** in AGENTS.md files:
- Root `AGENTS.md` — data flow, state management, change procedures, dependency graph
- `src/renderer/AGENTS.md` — VAO/FBO structure, instance data layout
- `src/simulation/AGENTS.md` — tick order, combat branching, reinforcement table
- `src/shaders/AGENTS.md` — `#include` mechanism, shape ID→SDF mapping
- `src/ui/AGENTS.md` — codex pool side effects, demo scenarios

## Coding Conventions

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. `incUnits()`/`decUnits()` 等の専用関数（`pools.ts`）経由で操作。外部からの直接変更は型エラー
- **beams**: Dynamic array (not pooled) — swap-and-pop for deletion (swap with last element + `.pop()`)
- **Functional/procedural**: No classes; game objects are plain typed objects
- **Japanese UI text**: Menu descriptions and unit abilities are in Japanese
- **Import conventions**: Relative paths + explicit `.ts` extension. No path aliases, no barrel exports
- **Dependency rules** (dependency-cruiser): `simulation/` → `state.ts` 禁止（rng/stateは引数注入）。`simulation/` → `ui/` 禁止（コールバック注入で逆転）。検証: `bun run check:deps`
- **TypeScript strict settings**:
  - `verbatimModuleSyntax` — type-only imports must use `import type { X }`
  - `exactOptionalPropertyTypes` — cannot assign `undefined` to optional props (use `prop?: T | undefined`)
  - `noUncheckedIndexedAccess` — array/record index returns `T | undefined`
  - `noImplicitReturns` — all branches must explicitly return
  - `noFallthroughCasesInSwitch` — switch文のフォールスルー禁止
  - `noUnusedLocals` / `noUnusedParameters` — 未使用変数・引数はエラー

**型安全メモ**:
- `1 - team` は `number` を返し `Team` 型にならない → `.team !== u.team` で比較すること
- Pool loop index requires branded type cast: `i as UnitIndex` (also `ParticleIndex`, `ProjectileIndex`)
- `u.target` is `UnitIndex` — `NO_UNIT` (-1) means no target; always check `.alive` on target

## Serena (MCP)

コード解析・編集にはSerenaのLSPツールをGrep/Globより優先すること：
- シンボル定義の検索・参照追跡 → `find_symbol`, `find_referencing_symbols`
- ファイル構造の把握 → `get_symbols_overview`（ファイル全読みを避ける）
- リネーム → `rename_symbol`（全参照を自動更新）
- コード編集 → `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`

Grep/Globを使う場面: 文字列リテラル検索、ファイル名パターン検索、非コードファイル（GLSL、JSON、MD）の検索

## Key Performance Patterns

- **Object pooling**: Pre-allocated arrays; `.alive` flag controls active state. Spawn scans for first dead slot
- **Instanced rendering**: `gl.drawArraysInstanced()` with VAOs. Instance buffer: 9 floats `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride 36 bytes). GLSL `#version 300 es`
- **Spatial hash**: `buildHash()` rebuilds every frame. `getNeighbors(x,y,r)` returns count; results in shared `neighborBuffer` — use immediately, do not copy
