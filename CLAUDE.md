# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese** (日本語で返答すること).

## Project Overview

**COSMARIUM** — a real-time space strategy/combat simulation game using vanilla TypeScript, HTML5 Canvas, and WebGL 2. Built with Vite + bun. No UI framework.

## Development

Uses **Bun** as package manager. Zero production dependencies. Dev deps: `vite`, `vite-plugin-glsl`, `@types/bun`, `@biomejs/biome`, `simple-git-hooks`, `knip`, `jscpd`.

**Linting & Formatting**: [Biome](https://biomejs.dev/) (Rust製の統合lint+formatter)。Pre-commit hook via `simple-git-hooks` + `biome check --staged` でステージされたファイルのみlint+format。

```bash
bun install          # Install dependencies
bun run dev          # Dev server at http://localhost:5173
bun run build        # Production build to dist/
bun run typecheck    # Type check (strict mode, but noUnusedLocals/noUnusedParameters off)
bun run lint         # Biome lint (src/)
bun run lint:fix     # Biome lint with auto-fix
bun run format       # Biome format (write)
bun run format:check # Biome format (check only)
bun run knip         # Unused export detection (knip)
bun run cpd          # Copy-paste detection (jscpd)
bun run check        # All checks combined (typecheck + biome ci + knip + cpd)
```

No test framework is configured. There are no automated tests.

**CI**: GitHub Actions runs `typecheck` + `lint` + `format:check` + `knip` + `cpd` on push/PR to `main`. `bun run check` は `biome ci .`（lint+format一括チェック）を使用。

**Biome key rules** (config in `biome.json`):
- `noVar: off`, `useConst: off` — `var` is used throughout; don't convert to `let`/`const`
- `noRedeclare: off` — TypeScript の型と同名の変数宣言を許可
- `noConsole: warn` — only `console.error` and `console.warn` are allowed
- `noExplicitAny: warn` — avoid `any` where possible
- `noNonNullAssertion: off` — non-null assertions (`!`) are allowed
- `noUnusedVariables: warn` — `_` prefix variables/args are ignored (Biome default)
- `noUnusedImports: warn` — unused imports are warned
- `noInnerDeclarations: off` — `var` inside blocks is allowed
- `useTemplate: off` — template literal conversion not enforced
- `src/shaders/**` is excluded from Biome (linter + formatter)
- Pre-commit hook は `biome check --staged --write` でエラーのみブロック（警告は許容）

**Biome formatter**: singleQuote, lineWidth=120, trailingCommas=all (config in `biome.json`). GLSL files are excluded.

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
  constants.ts                # Pool limits (PU/PP/PPR), WORLD, CELL, MAX_I, MM_MAX, S_STRIDE
  state.ts                    # Game state + setter functions (gameState, gameMode, beams, etc.)
  pools.ts                    # Object pools (uP/pP/prP) + poolCounts object
  colors.ts                   # TC[15][2], TrC[15][2], gC(), gTr()
  unit-types.ts               # TYPES[15] unit definitions
  shaders/                    # GLSL source files (imported via vite-plugin-glsl)
    includes/sdf.glsl           # Shared SDF functions (hexDist, manDist, polarR)
    main.vert.glsl, main.frag.glsl, quad.vert.glsl,
    bloom.frag.glsl, composite.frag.glsl,
    minimap.vert.glsl, minimap.frag.glsl
  renderer/
    webgl-setup.ts            # gl, canvas, viewport={W,H}, resize()
    shaders.ts                # CS(), CP(), program creation, Loc/mmLoc
    fbo.ts                    # mkFBO(), mkFBOs(), fbos={sF,bF1,bF2}
    buffers.ts                # qB, iB/iD, mmB/mmD, mainVAO/mmVAO/qVAO
    render-scene.ts           # renderScene() — writes instance data
    render-pass.ts            # 4-pass bloom pipeline
    minimap.ts                # mmW(), drawMinimap(), minimap events
  simulation/
    spatial-hash.ts           # hM, _nb, bHash(), gN(), kb()
    spawn.ts                  # spU(), killU(), spP(), spPr(), addBeam()
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

**Initialization order** (in main.ts): initWebGL → initShaders → mkFBOs → initBuffers → initUI → initCamera → initMinimap

**Main loop (per frame)**:
```
frame() → dt clamp(0.05) → camera lerp + shake decay
  → update(dt * timeScale)  — dt再clamp(0.033)
      bHash() → per unit: steer()+combat() → reflector pass
      → projectile pass → particle/beam pass  ← 常時実行
      [!catalogOpen時のみ: reinforce() → win check]
      [catalogOpen時: updateCatDemo(dt)]
  → renderFrame()
      renderScene() → iD[]書込み → GPU upload → drawArraysInstanced
      → bloom H/V → composite + drawMinimap()
      [catalogOpen時: カメラ→原点z=2.5固定、HUD/minimap省略]
```

**変更作業の詳細ガイド**: 各領域の変更指針・影響範囲・注意点は AGENTS.md を参照（ルート `AGENTS.md` + `src/renderer/AGENTS.md` + `src/simulation/AGENTS.md` + `src/shaders/AGENTS.md`）。

## Coding Conventions

- **Abbreviated names** (preserved from original — renaming is a separate task):
  - Pools: `uP`=units, `pP`=particles, `prP`=projectiles; `poolCounts.uC/pC/prC`=active counts
  - Pool limits: `PU=800`, `PP=35000`, `PPR=6000`
  - Spawners: `spU`=spawn unit, `spP`=spawn particle, `spPr`=spawn projectile
  - Spatial: `bHash`=build hash, `gN`=get neighbors, `kb`=knockback, `_nb`=neighbor buffer
  - Camera: `cam` object with `tx/ty/tz` (targets), `x/y/z` (interpolated), `shk/shkx/shky` (screen shake)
  - Rendering: `mP`=main program, `blP`=bloom program, `coP`=composite program, `mmP`=minimap program
  - VAOs: `mainVAO` (scene), `mmVAO` (minimap), `qVAO` (fullscreen quad)
  - FBOs: `fbos.sF`=scene, `fbos.bF1`/`fbos.bF2`=bloom ping-pong
  - Instance data: `iD`/`iB`=scene, `mmD`/`mmB`=minimap
  - Locations: `Loc`=main program attribs/uniforms, `mmLoc`=minimap program attribs, `blLoc`=bloom program uniforms, `coLoc`=composite program uniforms
  - Colors: `gC(typeIdx, team)` → [r,g,b], `gTr(typeIdx, team)` → trail color
  - State: `rT`=reinforcement timer (2.5秒間隔で `reinforce()` を発火)
- **State mutation**: Mutable state in `state.ts` uses `export var` + setter functions (e.g., `setGameState()`) because ES module `let` re-exports can't be assigned from importers. `poolCounts` object avoids this via property mutation.
- **Functional/procedural**: No classes; game objects are plain typed objects
- **Japanese UI text**: Menu descriptions and unit abilities are in Japanese
- **Import規約**: 相対パス + `.ts` 拡張子明示（`allowImportingTsExtensions: true`）。パスエイリアスなし、barrel export（index.ts）なし
- **TypeScript strict settings** (コーディングに影響する設定):
  - `verbatimModuleSyntax: true` — 型のみのインポートには `import type { X }` を使用必須
  - `exactOptionalPropertyTypes: true` — optional プロパティに直接 `undefined` 代入不可（`prop?: string | undefined` と宣言する必要あり）
  - `noUncheckedIndexedAccess: true` — 配列/辞書のインデックスアクセスは `T | undefined` 型になる
  - `noImplicitReturns: true` — 戻り値のある関数は全分岐で明示的に return 必須

## Key Performance Patterns

- **Object pooling**: All units/particles/projectiles pre-allocated; `.alive` flag controls active state. Spawn functions scan for first dead slot.
- **Instanced rendering (WebGL 2)**: Native `gl.drawArraysInstanced()` with VAOs. Instance buffer is 9 floats per instance: `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride = 36 bytes). All shaders use GLSL `#version 300 es` with `in`/`out` instead of `attribute`/`varying`.
- **Spatial hash**: `bHash()` rebuilds every frame using hash `(x/100 * 73856093) ^ (y/100 * 19349663)`. `gN(x,y,radius,buffer)` returns neighbor count. `_nb` is a shared 350-element buffer.
- **Bloom pipeline**: 4-pass rendering: scene FBO → horizontal blur (half-res) → vertical blur (half-res) → composite with vignette + Reinhard tone mapping.
- **Minimap**: WebGL-rendered via dedicated `mmP` shader program and `mmVAO`, drawn into a scissored viewport region. Uses instanced quads with a simplified vertex shader that reuses the `aA` slot for non-uniform Y scaling.
- **Render order** (in `renderScene()`): asteroids → bases → particles → beams → projectiles → units (later = drawn on top).
- **Simulation tick order** (in `update()`): bHash → steer+combat per unit → reflector shields → projectile movement+collision → particle/projectile lifetime decay.

## Shader Shape IDs

The fragment shader (`main.frag.glsl`) dispatches SDF patterns by integer shape ID:
- 0: Circle (default particle/projectile)
- 1: Diamond
- 2: Triangle (pointed up)
- 3: Hexagon
- 4: Cross
- 5: Ring
- 6: Arrow/missile
- 7: Star (5-point)
- 8: Crescent
- 9: Square
- 10: Glow ring (used for shockwaves/auras)
- 11: Chevron
- 12: Beam segment (horizontal line)
- 13: Diamond ring (hollow)
- 14: Trefoil (3-lobe)
- 15: Lightning bolt
- 16: Pentagon
- 20: Large hexagon (bases)

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

- **Veteran system**: 3+ kills → `vet=1`, 8+ kills → `vet=2`。速度ボーナス `+vet*12%`（vet2=+24%）、ダメージボーナス `+vet*20%`（vet2=+40%）
- **Team colors**: 15 unique color pairs per unit type (indexed by type, not team)
- **Reflector shield**: Nearby allies get `shielded=true` → projectiles deal 30% damage, beams reduced 60%
- **Catalog demo**: Spawns a controlled scenario per unit type for live preview in the catalog screen
