# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond in **Japanese** (日本語で返答すること).

## Project Overview

**COSMIC WARFARE** — a real-time space strategy/combat simulation game using vanilla TypeScript, HTML5 Canvas, and WebGL 2. Built with Vite + bun. No UI framework.

## Development

Uses **Bun** as package manager. Zero production dependencies. Dev deps: `vite`, `@types/bun`, `eslint`, `typescript-eslint`, `prettier`, `lint-staged`, `simple-git-hooks`.

**Linting & Formatting**: ESLint (flat config) + Prettier configured. Pre-commit hook via `simple-git-hooks` + `lint-staged` runs ESLint and Prettier on staged files.

```bash
bun install          # Install dependencies
bun run dev          # Dev server at http://localhost:5173
bun run build        # Production build to dist/
bun run typecheck    # Type check (strict mode, but noUnusedLocals/noUnusedParameters off)
bun run lint         # ESLint (src/)
bun run lint:fix     # ESLint with auto-fix
bun run format       # Prettier format (write)
bun run format:check # Prettier format (check only)
bun run check        # All checks combined (typecheck + lint + format:check)
```

No test framework is configured. There are no automated tests.

**ESLint key rules** (flat config in `eslint.config.js`):
- `no-var: off`, `prefer-const: off` — `var` is used throughout; don't convert to `let`/`const`
- `no-console: warn` — only `console.error` and `console.warn` are allowed
- `@typescript-eslint/no-explicit-any: warn` — avoid `any` where possible
- `src/shaders/**` is excluded from ESLint

**Prettier**: singleQuote, printWidth=120, trailingComma=all (config in `.prettierrc.json`). GLSL files are excluded from Prettier.

GLSL shaders are imported as raw strings via Vite's `?raw` suffix (type-declared in `vite-env.d.ts`).

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
  vite-env.d.ts               # Vite type declarations + .glsl?raw module
  types.ts                    # All TypeScript interfaces (Unit, Particle, Projectile, etc.)
  constants.ts                # Pool limits (PU/PP/PPR), WORLD, CELL, MAX_I, MM_MAX
  state.ts                    # Game state + setter functions (gameState, gameMode, beams, etc.)
  pools.ts                    # Object pools (uP/pP/prP) + poolCounts object
  colors.ts                   # TC[15][2], TrC[15][2], gC(), gTr()
  unit-types.ts               # TYPES[15] unit definitions
  shaders/                    # GLSL source files (imported as ?raw)
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

- **Veteran system**: 3+ kills → `vet=1` (12% speed/damage bonus); 8+ kills → `vet=2` (24% bonus)
- **Team colors**: 15 unique color pairs per unit type (indexed by type, not team)
- **Reflector shield**: Nearby allies get `shielded=true` → projectiles deal 30% damage, beams reduced 60%
- **Catalog demo**: Spawns a controlled scenario per unit type for live preview in the catalog screen
