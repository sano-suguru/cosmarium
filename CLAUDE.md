# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**COSMIC WARFARE** — a real-time space strategy/combat simulation game. The entire project is a single self-contained `index.html` file (~1,870 lines) using vanilla JavaScript (ES5), HTML5 Canvas, and WebGL. Zero external dependencies.

## Running the Game

```bash
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

No build step, package manager, linting, or test suite exists. To test changes, reload the browser.

## Controls

- Mouse wheel: Zoom (0.05x–8x, centers on cursor)
- Click+drag: Pan camera
- Spacebar: Reset view
- Tab/Escape: Unit catalog
- `+`/`-`: Adjust simulation speed (0.2x–2.5x, default 0.55x)
- Minimap click: Navigate to location

## Architecture (line ranges approximate)

Single-file structure, top to bottom:

| Lines | Section | Key globals/functions |
|---|---|---|
| 1–222 | **HTML/CSS** | Menu UI, HUD, catalog modal, minimap canvas, speed controls |
| 225–461 | **WebGL setup + Shaders** | `gl`, `ext` (ANGLE_instanced_arrays), `mP`/`blP`/`coP` (programs), `sF`/`bF1`/`bF2` (FBOs) |
| 463–486 | **Object pools** | `uP[800]`, `pP[35000]`, `prP[6000]` — units, particles, projectiles |
| 488–506 | **Color tables** | `TC[15][2]` (team colors), `TrC[15][2]` (trail colors) |
| 508–542 | **Unit type definitions** | `TYPES[15]` — all unit stats, flags, and descriptions |
| 544–570 | **World/game state** | `WORLD=4000`, `asteroids[]`, `bases[2]`, `beams[]`, `gameState`, `gameMode` |
| 572–628 | **Spawn helpers** | `spU()`, `killU()`, `spP()`, `spPr()`, `addBeam()` |
| 630–673 | **Spatial hash** | `bHash()` (rebuild), `gN()` (query neighbors), `kb()` (knockback) |
| 675–762 | **Effects** | `explosion()`, `trail()`, `chainLightning()` |
| 764–894 | **Steering/AI** | `steer()` — boid separation/alignment/cohesion + target acquisition |
| 896–1148 | **Combat** | `combat()` — per-type attack patterns (ram, heal, reflect, carrier, EMP, teleport, chain, beam, normal fire) |
| 1150–1220 | **Reinforcements + Init** | `reinforce()`, `initUnits()` |
| 1222–1366 | **Catalog** | Demo system, UI builder |
| 1368–1528 | **Main update** | `update()` — physics, projectiles, particles, beams, base damage, win checks |
| 1530–1636 | **Render** | `renderScene()` — writes instance data; `dQ()` — draws fullscreen quad |
| 1638–1686 | **Minimap** | 160×160 2D canvas overlay, `drawMinimap()` |
| 1688–1870 | **Game control + Main loop** | `startGame()`, `showWin()`, `backToMenu()`, `frame()` |

## Coding Conventions

- **ES5 strict**: `var`, no arrow functions, no destructuring, no classes, no template literals
- **Abbreviated names** (performance/code-golf style):
  - Pools: `uP`=units, `pP`=particles, `prP`=projectiles; `uC`/`pC`/`prC`=active counts
  - Pool limits: `PU=800`, `PP=35000`, `PPR=6000`
  - Spawners: `spU`=spawn unit, `spP`=spawn particle, `spPr`=spawn projectile
  - Spatial: `bHash`=build hash, `gN`=get neighbors, `kb`=knockback, `_nb`=neighbor buffer
  - Camera: `cam` object with `tx/ty/tz` (targets), `x/y/z` (interpolated), `shk/shkx/shky` (screen shake)
  - Rendering: `mP`=main program, `blP`=bloom program, `coP`=composite program
  - FBOs: `sF`=scene, `bF1`/`bF2`=bloom ping-pong
  - Colors: `gC(typeIdx, team)` → [r,g,b], `gTr(typeIdx, team)` → trail color
  - Shaders: `CS`=create shader, `CP`=create program
  - Time: `dt`=delta, `lt`=last time, `fc`=frame count, `ft`=frame timer, `df`=display FPS
- **Functional/procedural**: No classes; game objects are plain property bags
- **Global state**: Everything lives at module scope
- **Japanese UI text**: Menu descriptions and unit abilities are in Japanese

## Key Performance Patterns

- **Object pooling**: All units/particles/projectiles pre-allocated; `.alive` flag controls active state. Spawn functions scan for first dead slot.
- **Instanced rendering**: Single `drawArraysInstancedANGLE` call. Instance buffer is 9 floats per instance: `[x, y, size, r, g, b, alpha, angle, shapeID]` (stride = 36 bytes).
- **Spatial hash**: `bHash()` rebuilds every frame using hash `(x/100 * 73856093) ^ (y/100 * 19349663)`. `gN(x,y,radius,buffer)` returns neighbor count. `_nb` is a shared 350-element buffer.
- **Bloom pipeline**: 4-pass rendering: scene FBO → horizontal blur (half-res) → vertical blur (half-res) → composite with vignette + Reinhard tone mapping.

## Shader Shape IDs

The fragment shader (`mainFS`) dispatches SDF patterns by integer shape ID:
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
