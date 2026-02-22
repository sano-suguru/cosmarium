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

**Biome** (config in `biome.json`): Pre-commit hook runs `biome check --staged --write`. Formatter: singleQuote, semicolons: always, trailingCommas: all, indentWidth: 2, lineWidth: 120. Key non-obvious rules:
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
- `spawnAt(team, type, x, y)` — mocks `Math.random` for deterministic unit spawning

GLSL shaders are imported via `vite-plugin-glsl` (`#include` directives). Shared SDF functions: `src/shaders/includes/sdf.glsl`.

**PRNG**: `rng()` (`state.ts`) — mulberry32ベースの決定論的乱数。`seedRng(seed)` でシード固定可能（テスト用）。シミュレーション内では`rng()`を使用。`main.ts`のカメラシェイクは`Math.random()`（シード制御対象外）。

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

**Init order** (main.ts): initWebGL → initShaders → createFBOs → initBuffers → initUI → initCamera → initMinimap

**Main loop**:
```
frame() → dt clamp(0.05) → camera lerp + shake decay
  → update(dt * timeScale)  — dt > 1/REF_FPS なら最大8サブステップに分割
      stepOnce: buildHash → updateSwarmN → resetReflected
        → per unit: steer+combat+trail+boostEffect
        → applyReflectorShields → projectiles → particles
        → beams(swap-and-pop) → pendingChains → trackingBeams
        [!codexOpen: reinforce → win check]
        [codexOpen: updateCodexDemo, non-demo units skip steer/combat]
  → renderFrame()
      renderScene() → GPU upload → drawArraysInstanced
      → bloom H/V → composite + drawMinimap()
      [codexOpen: camera locked to origin z=2.5, HUD/minimap hidden]
```

**Detailed change guides** in AGENTS.md files:
- Root `AGENTS.md` — data flow, state management, change procedures, dependency graph
- `src/renderer/AGENTS.md` — VAO/FBO structure, instance data layout
- `src/simulation/AGENTS.md` — tick order, combat branching, reinforcement table
- `src/shaders/AGENTS.md` — `#include` mechanism, shape ID→SDF mapping
- `src/ui/AGENTS.md` — codex pool side effects, demo scenarios

## Coding Conventions

- **State mutation**: `state.ts` exports `const state: State` — mutate via property assignment
- **poolCounts**: `Readonly<>` export. Mutation only through spawn/kill functions (internal `_counts` type assertion). Direct assignment is a type error
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

**Anti-patterns to avoid**:
- `1 - team` returns `number`, not `Team` → use `enemyTeam()` helper from `types.ts`
- Never mutate `poolCounts` directly → use spawn/kill functions
- Pool loop index requires branded type cast: `i as UnitIndex` (also `ParticleIndex`, `ProjectileIndex`)
- `u.target` is `UnitIndex` — `NO_UNIT` (-1) means no target; always check `.alive` on target

## Key Performance Patterns

- **Object pooling**: Pre-allocated arrays; `.alive` flag controls active state. Spawn scans for first dead slot
- **Instanced rendering**: `gl.drawArraysInstanced()` with VAOs. Instance buffer: 9 floats `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride 36 bytes). GLSL `#version 300 es`
- **Spatial hash**: `buildHash()` rebuilds every frame. `getNeighbors(x,y,r)` returns count; results in shared `neighborBuffer` — use immediately, do not copy
- **Bloom**: 4-pass: scene FBO → H blur (half-res) → V blur (half-res) → composite
- **Render order**: asteroids → bases → particles → beams → projectiles → units

## Shader Shape IDs

The fragment shader (`main.frag.glsl`) dispatches SDF patterns by integer shape ID:

| ID | Shape | Used by |
|----|-------|---------|
| 0 | Circle | particle, projectile(aoe/default), HP bar, stun spark |
| 1 | Diamond | projectile(通常弾), minimap背景/unit |
| 2 | Triangle | — |
| 3 | Hexagon | asteroid |
| 4 | Cross | — |
| 5 | Ring | reflector shield表示 |
| 6 | Arrow | homing projectile, minimap unit |
| 7 | Star(5) | — |
| 8 | Crescent | — |
| 9 | Square | — |
| 10 | Glow ring | explosion ring, vet glow, EMP ring, shield aura, base glow |
| 11 | Chevron | — |
| 12 | Beam | beam segments |
| 13 | Diamond ring | — |
| 14 | Trefoil | — |
| 15 | Lightning | — |
| 16 | Pentagon | — |
| 20 | Large hexagon | base (mode=2) |
| 21 | Bar | HPバー (背景+前景) |
| 22 | Octagon shield | reflectorシールド/shield linger |
| 23 | Lightning beam | チェーンライトニングのビームセグメント |
| 24 | Flagship Dreadnought | Flagship |
| 25 | Medical Frigate | Healer |
| 26 | Prism Shield | Reflector |

## Combat Branching (combat.ts)

排他パターン（`return`あり）: `rams` → `reflects` → `emp` → `chain` → `sweep` → `beam`（spawns除く）
非排他（他と共存可）: `heals`, `spawns`, `teleports`
最後: NORMAL FIRE — `homing` / `aoe` / `sh===3`(5-burst) / `sh===8`(railgun) / default

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `codexOpen`は複数層に影響 | simulation(非デモユニットのsteer/combatスキップ、steps 7-10スキップ→updateCodexDemo)、renderer(カメラ固定)、input(操作無効化)、main(HUD/minimap省略) |
| GLSLのGPUコンパイルはランタイムのみ | CIでは検出不可。シェーダ変更後はブラウザで確認必須 |
| Codexがプールを消費 | `spawnUnit()`で実ユニット生成。`POOL_UNITS`上限に影響。`killUnit()`での破棄漏れ注意 |
| `neighborBuffer`は共有バッファ | `getNeighbors()`後に即使用。`buildHash()`後のみ有効（途中のユニット追加は反映されない） |
| `dt`は`update()`でサブステップ分割 | `dt > 1/REF_FPS`なら最大`MAX_STEPS_PER_FRAME=8`回の`stepOnce`に分割。クランプではなく分割 |
| プール上限変更時は`constants.ts`のみ | `pools.ts`は定数を参照済み。新オブジェクト種追加時のみ`pools.ts`にも配列初期化が必要 |
| `writeInstance()`のidx上限 | `MAX_INSTANCES`を超えるとサイレントに描画省略 |
| `killUnit()`前にデータ退避必須 | killでスロット即時再利用 — 参照中の値が破壊される可能性あり |
