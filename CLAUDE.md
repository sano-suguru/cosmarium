# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese** (日本語で返答すること).

## Project Overview

**COSMARIUM** — a real-time space strategy/combat simulation game using vanilla TypeScript, HTML5 Canvas, and WebGL 2. Built with Vite + bun. No UI framework.

## Development

Uses **Bun** as package manager. Zero production dependencies. Dev deps: `vite`, `vite-plugin-glsl`, `@types/bun`, `@biomejs/biome`, `simple-git-hooks`, `knip`, `jscpd`, `vitest`.

**Linting & Formatting**: [Biome](https://biomejs.dev/) (Rust-based unified linter + formatter). Pre-commit hook via `simple-git-hooks` runs `bunx biome check --staged --no-errors-on-unmatched --write && git update-index --again` on staged files only.

```bash
bun install          # Install dependencies
bun run dev          # Dev server at http://localhost:5173
bun run build        # Production build to dist/
bun run typecheck    # Type check (strict mode)
bun run lint         # Biome lint (src/)
bun run lint:fix     # Biome lint with auto-fix
bun run format       # Biome format (write)
bun run format:check # Biome format (check only)
bun run knip         # Unused export detection (knip)
bun run cpd          # Copy-paste detection (jscpd)
bun run test         # Vitest watch mode
bun run test:run     # Vitest single run (used in CI)
bun run check        # All checks combined (typecheck + biome ci + knip + cpd + vitest run)
```

**Testing**: [Vitest](https://vitest.dev/) for unit tests. Test files: `src/**/*.test.ts`. Vitest config: `environment: 'node'` (no DOM), `restoreMocks: true` (mocks auto-restored between tests). Test files have `noConsole: off` in Biome config. Run a single test: `bunx vitest run src/path/to.test.ts`.

Helper utilities in `src/__test__/pool-helper.ts`:
- `resetPools()` — resets all pools (unitPool/particlePool/projectilePool) to dead state and zeroes poolCounts
- `resetState()` — resets game state to menu defaults (gameState→menu, gameMode→0, bases HP→500, etc.)
- `spawnAt(team, type, x, y)` — mocks `Math.random` for deterministic unit spawning (ang/cd/wn fixed to 0)

**CI**: GitHub Actions (`.github/workflows/ci.yml`) — 4 parallel jobs on push/PR to `main`:
- `typecheck`: `bun run typecheck`
- `lint`: `bunx biome ci .`
- `quality`: `bun run knip` + `bun run cpd`
- `test`: `bun run test:run` (runs after `typecheck` via `needs: [typecheck]`)

Deploy workflow builds with `--base=/cosmarium/` and publishes to GitHub Pages.

**Biome key rules** (config in `biome.json`):
- `noVar: error`, `useConst: error` — use `let`/`const` (`var` is forbidden)
- `noRedeclare: off` — allows variables with the same name as TypeScript types
- `noConsole: error` — only `console.error` and `console.warn` are allowed
- `noExplicitAny: error` — avoid `any` where possible
- `noNonNullAssertion: off` — non-null assertions (`!`) are allowed
- `noUnusedVariables: error` — `_` prefix variables/args are ignored (Biome default)
- `noUnusedImports: error` — unused imports are errors
- `noInnerDeclarations: off` — function declarations inside blocks are allowed
- `useTemplate: off` — template literal conversion not enforced
- `noEvolvingTypes: error`, `noEmptyBlockStatements: error` — forbids unstable type inference and empty blocks
- `noDelete: error`, `noBarrelFile: error`, `noReExportAll: error` — performance-related rules
- `noForEach: warn` — `for...of` preferred, but existing DOM API usage is tolerated
- `noExcessiveCognitiveComplexity: warn (max 25)` — complexity warning (non-blocking in CI)
- style warnings: `noNestedTernary`, `noParameterAssign`, `noYodaExpression`
- `src/shaders/**` is excluded from Biome (linter + formatter)
- Pre-commit hook uses `biome check --staged --no-errors-on-unmatched --write` — only errors block commit (warnings are tolerated)
- Test file overrides (`**/*.test.ts`, `src/__test__/**`): `noConsole: off`

**Biome formatter**: 2-space indent, LF line endings, singleQuote, lineWidth=120, trailingCommas=all, semicolons=always, bracketSpacing=true, arrowParentheses=always (config in `biome.json`). GLSL files are excluded.

GLSL shaders are imported via `vite-plugin-glsl` which supports `#include` directives for shared chunks. Shared SDF functions live in `src/shaders/includes/sdf.glsl`.

## Controls

- Mouse wheel: Zoom (0.05x–8x, centers on cursor)
- Click+drag: Pan camera
- Spacebar: Reset view
- Tab/Escape: Unit catalog
- `+`/`-`: Adjust simulation speed (0.2x–2.5x, default 0.55x)
- Minimap click: Navigate to location

## Architecture

```
src/
  main.ts                     # Entry point + main loop (frame())
  style.css                   # All CSS
  vite-env.d.ts               # Vite type declarations + .glsl module
  types.ts                    # All TypeScript interfaces (Unit, Particle, Projectile, etc.)
  constants.ts                # Pool limits (POOL_UNITS/POOL_PARTICLES/POOL_PROJECTILES), WORLD_SIZE, CELL_SIZE, MAX_INSTANCES, MINIMAP_MAX, STRIDE_BYTES
  state.ts                    # Game state + setter functions (gameState, gameMode, beams, etc.)
  pools.ts                    # Object pools (unitPool/particlePool/projectilePool) + poolCounts object
  colors.ts                   # teamColors[15][2], trailColors[15][2], getColor(), getTrailColor()
  unit-types.ts               # TYPES[15] unit definitions
  shaders/                    # GLSL source files (imported via vite-plugin-glsl)
    includes/sdf.glsl           # Shared SDF functions (hexDist, manDist, polarR)
    main.vert.glsl, main.frag.glsl, quad.vert.glsl,
    bloom.frag.glsl, composite.frag.glsl,
    minimap.vert.glsl, minimap.frag.glsl
  renderer/
    webgl-setup.ts            # gl, canvas, viewport={W,H}, resize()
    shaders.ts                # compileShader(), createProgram(), program creation, mainLocations/minimapLocations
    fbo.ts                    # createFBO(), createFBOs(), fbos={scene,bloom1,bloom2}
    buffers.ts                # quadBuffer, instanceBuffer/instanceData, minimapBuffer/minimapData, mainVAO/mmVAO/qVAO
    render-scene.ts           # renderScene() — writes instance data
    render-pass.ts            # 4-pass bloom pipeline
    minimap.ts                # writeMinimapInstance(), drawMinimap(), minimap events
  simulation/
    spatial-hash.ts           # hashMap, neighborBuffer, buildHash(), getNeighbors(), knockback()
    spawn.ts                  # spawnUnit(), killUnit(), spawnParticle(), spawnProjectile(), addBeam()
    effects.ts                # explosion(), trail(), chainLightning()
    steering.ts               # steer() — boids + target AI
    combat.ts                 # combat() — 9 attack pattern types
    reinforcements.ts         # reinforce()
    init.ts                   # initUnits(), genAsteroids()
    update.ts                 # update() — main simulation tick
  input/
    camera.ts                 # cam object, mouse/wheel/drag, addShake()
  ui/
    catalog.ts                # setupCatDemo(), updateCatDemo(), buildCatUI(), toggleCat()
    game-control.ts           # setSpd(), startGame(), showWin(), backToMenu(), initUI()
    hud.ts                    # updateHUD()
```

**Initialization order** (in main.ts): initWebGL → initShaders → createFBOs → initBuffers → initUI → initCamera → initMinimap

**Main loop (per frame)**:
```
frame() → dt clamp(0.05) → camera lerp + shake decay
  → update(dt * timeScale)  — dt re-clamped to 0.033
      buildHash() → per unit: steer()+combat() → reflector pass
      → projectile pass → particle/beam pass  ← always runs
      [when !catalogOpen: reinforce() → win check]
      [when catalogOpen: updateCatDemo(dt)]
  → renderFrame()
      renderScene() → write instanceData[] → GPU upload → drawArraysInstanced
      → bloom H/V → composite + drawMinimap()
      [when catalogOpen: camera locked to origin z=2.5, HUD/minimap hidden]
```

**Dependency graph** (変更影響マップ):
```
types.ts     ← 全ファイルが依存（型定義の変更は全体に波及）
constants.ts ← pools.ts, simulation/*, renderer/*, ui/catalog.ts, ui/hud.ts
state.ts     ← main.ts, simulation/*, renderer/render-pass.ts, renderer/render-scene.ts,
               renderer/minimap.ts, input/camera.ts, ui/*
pools.ts     ← simulation/*, renderer/render-scene.ts, renderer/minimap.ts, ui/catalog.ts, ui/hud.ts
colors.ts    ← simulation/combat.ts, simulation/effects.ts, renderer/render-scene.ts,
               renderer/minimap.ts, ui/catalog.ts
unit-types.ts ← simulation/*, renderer/render-scene.ts, renderer/minimap.ts, ui/catalog.ts
input/camera.ts ← simulation/effects.ts, simulation/update.ts（addShakeをインポート）
```

**Detailed change guide**: See AGENTS.md for per-area guidelines, impact scope, and caveats:
- Root `AGENTS.md` — pool constants, vet system, data flow, state management patterns
- `src/renderer/AGENTS.md` — VAO/FBO structure, instance data layout, new uniform/entity procedures
- `src/simulation/AGENTS.md` — tick order (10 steps), combat branching, reinforcement probability table
- `src/shaders/AGENTS.md` — `#include` mechanism, shape ID→SDF mapping, minimap attribute reuse
- `src/ui/AGENTS.md` — catalog pool side effects, demo scenario branching, speed presets

## Coding Conventions

- **Abbreviated names** (preserved from original — renaming is a separate task):
  - Pools: `unitPool`=units, `particlePool`=particles, `projectilePool`=projectiles; `poolCounts.unitCount/particleCount/projectileCount`=active counts
  - Pool/World: `POOL_UNITS=800`, `POOL_PARTICLES=35000`, `POOL_PROJECTILES=6000`, `WORLD_SIZE=4000`, `CELL_SIZE=100`, `MAX_INSTANCES=65000`, `MINIMAP_MAX=1200`, `STRIDE_BYTES=36`
  - Spawners: `spawnUnit`=spawn unit, `spawnParticle`=spawn particle, `spawnProjectile`=spawn projectile
  - Spatial: `buildHash`=build hash, `getNeighbors`=get neighbors, `knockback`=knockback, `neighborBuffer`=neighbor buffer
  - Camera: `cam` object with `targetX/targetY/targetZ` (targets), `x/y/z` (interpolated), `shake/shakeX/shakeY` (screen shake)
  - Rendering: `mainProgram`=main program, `bloomProgram`=bloom program, `compositeProgram`=composite program, `minimapProgram`=minimap program
  - VAOs: `mainVAO` (scene), `mmVAO` (minimap), `qVAO` (fullscreen quad)
  - FBOs: `fbos.scene`=scene, `fbos.bloom1`/`fbos.bloom2`=bloom ping-pong
  - Instance data: `instanceData`/`instanceBuffer`=scene, `minimapData`/`minimapBuffer`=minimap
  - Locations: `mainLocations`=main program attribs/uniforms, `minimapLocations`=minimap program attribs, `bloomLocations`=bloom program uniforms, `compositeLocations`=composite program uniforms
  - Colors: `getColor(typeIdx, team)` → [r,g,b], `getTrailColor(typeIdx, team)` → trail color
  - State: `reinforcementTimer`=reinforcement timer (fires `reinforce()` every 2.5s)
- **State mutation**: Mutable state in `state.ts` uses `export let` + setter functions (e.g., `setGameState()`) because ES module exports can't be assigned from importers. `poolCounts` object avoids this via property mutation.
- **Functional/procedural**: No classes; game objects are plain typed objects
- **Japanese UI text**: Menu descriptions and unit abilities are in Japanese (日本語)
- **Import conventions**: Relative paths + explicit `.ts` extension (`allowImportingTsExtensions: true`). No path aliases, no barrel exports (`index.ts`)
- **TypeScript strict settings** (settings that affect coding):
  - `verbatimModuleSyntax: true` — type-only imports must use `import type { X }`
  - `exactOptionalPropertyTypes: true` — cannot assign `undefined` directly to optional properties (must declare as `prop?: string | undefined`)
  - `noUncheckedIndexedAccess: true` — array/record index access returns `T | undefined`
  - `noImplicitReturns: true` — all branches in functions with return values must explicitly return

## Key Performance Patterns

- **Object pooling**: All units/particles/projectiles pre-allocated; `.alive` flag controls active state. Spawn functions scan for first dead slot.
- **Instanced rendering (WebGL 2)**: Native `gl.drawArraysInstanced()` with VAOs. Instance buffer is 9 floats per instance: `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride = 36 bytes). All shaders use GLSL `#version 300 es` with `in`/`out` instead of `attribute`/`varying`.
- **Spatial hash**: `buildHash()` rebuilds every frame using hash `(x/100 * 73856093) ^ (y/100 * 19349663)`. `getNeighbors(x,y,radius,buffer)` returns neighbor count. `neighborBuffer` is a shared 350-element buffer.
- **Bloom pipeline**: 4-pass rendering: scene FBO → horizontal blur (half-res) → vertical blur (half-res) → composite with vignette + Reinhard tone mapping.
- **Minimap**: WebGL-rendered via dedicated `minimapProgram` shader program and `mmVAO`, drawn into a scissored viewport region. Uses instanced quads with a simplified vertex shader that reuses the `aA` slot for non-uniform Y scaling.
- **Render order** (in `renderScene()`): asteroids → bases → particles → beams → projectiles → units (later = drawn on top).
- **Simulation tick order** (in `update()`): buildHash → steer+combat per unit → reflector shields → projectile movement+collision → particle/projectile lifetime decay.

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
| 7 | Star(5) | vet星バッジ (vet≥1: 1個, vet≥2: 2個) |
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

## Unit Type Index

| Idx | Name | Key flags |
|---|---|---|
| 0 | Drone | (basic) |
| 1 | Fighter | (basic) |
| 2 | Bomber | `aoe:70` |
| 3 | Cruiser | `beam:true` |
| 4 | Flagship | 5-burst (shape 3) |
| 5 | Healer | `heals:true` |
| 6 | Reflector | `reflects:true` |
| 7 | Carrier | `spawns:true` |
| 8 | Sniper | shape 8, long range |
| 9 | Ram | `rams:true` |
| 10 | Missile | `homing:true` |
| 11 | EMP | `emp:true` |
| 12 | Beam Frig. | `beam:true` |
| 13 | Teleporter | `teleports:true` |
| 14 | Chain Bolt | `chain:true` |

## Game Modes

- **Mode 0 — INFINITE**: Endless war. Reinforcements auto-spawn when team count < 130.
- **Mode 1 — ANNIHILATION**: No reinforcements. Destroy all enemy units to win.
- **Mode 2 — BASE ASSAULT**: Bases at x=±1800 with 500 HP. Reinforcements when < 100 units. Units within 80px of enemy base deal damage.

## Game Mechanics

- **Veteran system**: 3+ kills → `vet=1`, 8+ kills → `vet=2`. Speed bonus `+vet*12%` (vet2=+24%), damage bonus `+vet*20%` (vet2=+40%)
- **Team colors**: 15 unique color pairs per unit type (indexed by type, not team)
- **Reflector shield**: Nearby allies get `shielded=true` → projectiles deal 30% damage, beams reduced 60%
- **Catalog demo**: Spawns a controlled scenario per unit type for live preview in the catalog screen

## Combat Branching (combat.ts)

排他パターン（`return`あり）: `rams` → `reflects` → `emp` → `chain` → `beam`（spawns除く）
非排他（他と共存可）: `heals`, `spawns`, `teleports`
最後: NORMAL FIRE — `homing` / `aoe` / `sh===3`(5-burst) / `sh===8`(railgun) / default

## Common Change Procedures

### 新ユニット追加
1. `unit-types.ts` — `TYPES[]`に定義追加
2. `types.ts` — 新フラグがあれば`Unit`に追加
3. `colors.ts` — `teamColors[]`+`trailColors[]`に色ペア追加
4. `simulation/combat.ts` — 攻撃パターン分岐追加（排他なら`return`）
5. `simulation/steering.ts` — 特殊移動があれば`steer()`に追加
6. `simulation/spawn.ts` — 新プロパティがあれば`spawnUnit()`初期化に追加
7. `ui/catalog.ts` — `setupCatDemo()`にデモシナリオ追加
8. `src/shaders/main.frag.glsl` — 新シェイプが必要ならSDF追加

### 新攻撃パターン追加
1. `types.ts` — `UnitType`に新フラグ追加
2. `unit-types.ts` — 該当エントリにフラグ追加
3. `combat.ts` — NORMAL FIREの前に`if (t.newFlag)`分岐挿入
4. `spawn.ts` — 新Unitプロパティがあれば`spawnUnit()`初期化に追加

### 新パーティクルエフェクト追加
1. `simulation/effects.ts` — エフェクト関数追加（`spawnParticle()`でパーティクル生成）
2. 呼び出し元（`combat.ts`/`update.ts`）からインポート

### 新Shape追加
1. `main.frag.glsl` — 最後の`else if`の前にSDF分岐追加（次の空きID）
2. SDF関数が必要なら`includes/sdf.glsl`に追加
3. `unit-types.ts` — 該当ユニットの`sh`に新IDを設定
4. **minimap.fragは変更不要**（SDFを使わず色パススルー）

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `Team`型（`0 \| 1`）で `1 - team` は `number` を返す | `team === 0 ? 1 : 0` で代替 |
| `catalogOpen`は複数層に影響 | simulation(steps 1-6常時実行、7-10スキップ→updateCatDemo)、renderer(カメラ→原点z=2.5固定)、input(操作無効化)、main(HUD/minimap省略) |
| state変数を外部モジュールから直接代入しない | ESMバインディングは外部から読取専用。`export let` + setter経由で変更 |
| `poolCounts`のカウンタは手動管理 | spawn/kill時に必ずインクリメント/デクリメント。漏れるとHUD・増援ロジックが狂う |
| `neighborBuffer`バッファは共有（350要素） | `getNeighbors()`の戻り値=バッファ内の有効数。コピーせず即使用 |
| GLSLのGPUコンパイルはランタイムのみ | CIでは検出不可。シェーダ変更後はブラウザで確認必須 |
| カタログがプールを消費 | `spawnUnit()`で実ユニット生成。`POOL_UNITS`上限に影響。`killUnit()`での破棄漏れ注意 |
| `dt`は`update()`冒頭で0.033にクランプ | 大きすぎるdtで物理が壊れるのを防止 |
| `killUnit()`はindexで呼ぶ | `killUnit(oi)` — Unit参照ではなくプール配列index |
| `u.target`はプールindex | -1=ターゲットなし。ターゲットの`.alive`を必ずチェック |
| `beams`は`.splice()`で削除 | プールではなく動的配列。逆順ループ必須 |
| `getNeighbors()`は`buildHash()`後のみ有効 | フレーム冒頭で再構築。途中でユニット追加しても反映されない |
| `writeInstance()`のidx上限 | `MAX_INSTANCES`を超えるとサイレントに描画省略。描画消え→`MAX_INSTANCES`増加を検討 |
| プール上限変更時は2ファイル | `constants.ts`の定数と`pools.ts`の配列初期化を両方変更 |
| Reflector判定が名前文字列 | `TYPES[u.type]!.name !== 'Reflector'` — 名前変更で壊れる |

## MCP Tools Guide

This project integrates AST-grep and LSP (TypeScript Language Server) MCP servers (configured in `.mcp.json`).

### AST-grep Tools (Structural Pattern Search)

| Tool | Purpose |
|------|---------|
| `mcp__ast-grep__find_code` | Simple pattern matching (e.g. `spawnUnit($$$)`) |
| `mcp__ast-grep__find_code_by_rule` | Advanced structural search via YAML rules |
| `mcp__ast-grep__dump_syntax_tree` | Inspect AST node structure |
| `mcp__ast-grep__test_match_code_rule` | Test rules before use |

### LSP Tools (Semantic Analysis)

| Tool | Purpose |
|------|---------|
| `mcp__lsp-ts__definition` | Jump to symbol definition |
| `mcp__lsp-ts__references` | Find all references to a symbol |
| `mcp__lsp-ts__hover` | Get type info and signatures |
| `mcp__lsp-ts__diagnostics` | Get TypeScript errors/warnings for a file |

### When to Use Which

- **"Where is this function used?"** → LSP `mcp__lsp-ts__references`
- **"Where is this function defined?"** → LSP `mcp__lsp-ts__definition`
- **"Show all call patterns of `spawnUnit()`"** → AST-grep `mcp__ast-grep__find_code`
- **"Detect a specific syntax pattern across the codebase"** → AST-grep `mcp__ast-grep__find_code_by_rule`
- **"Assess refactoring impact"** → Combine both (see `refactor-safe` skill)

### Recommended Refactoring Workflow

1. **Impact analysis**: Use LSP `mcp__lsp-ts__references` + AST-grep `mcp__ast-grep__find_code` to identify all reference sites
2. **Planning**: Determine target files and change order
3. **Execution**: Change in order: type definitions → implementations → usage sites
4. **Verification**: Confirm correctness with LSP `mcp__lsp-ts__diagnostics` + `bun run check`
