# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**COSMIC WARFARE** — a real-time space strategy/combat simulation game. The entire project is a single self-contained `index.html` file (~1,854 lines, ~64KB) using vanilla JavaScript (ES5), HTML5 Canvas, and WebGL. Zero external dependencies.

## Running the Game

```bash
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

No build step, package manager, linting, or test suite exists.

## Controls

- Mouse wheel: Zoom (0.05x–8x)
- Click+drag: Pan camera
- Spacebar: Reset view
- Tab/Escape: Unit catalog
- `+`/`-`: Adjust simulation speed

## Architecture

The file is organized into these logical sections (top to bottom):

1. **HTML/CSS** — Menu UI, HUD overlay, catalog modal, minimap canvas
2. **WebGL Setup** — Canvas init, GL context, `ANGLE_instanced_arrays` extension
3. **Shaders (GLSL)** — 5 shader programs:
   - `mainVS`/`mainFS`: Unit/particle rendering with 21 SDF shape patterns (shape IDs 0–15, 20)
   - `qVS`/`blFS`: Bloom post-processing (Gaussian blur)
   - `qVS`/`coFS`: Final composite with Reinhard tone mapping
4. **Camera System** — Position, zoom, smooth interpolation, screen shake
5. **Object Pools** — Pre-allocated fixed arrays: units (800), particles (35,000), projectiles (6,000)
6. **Unit Type Definitions** — 15 unit types (Drone, Fighter, Bomber, Cruiser, Flagship, Healer, Reflector, Carrier, Sniper, Ram, Missile, EMP, Beam Frig., Teleporter, Chain Bolt)
7. **Spatial Hash Grid** — Cell-based (100px cells) with Cantor pairing for O(1) neighbor queries
8. **Physics & AI** — Boid-like steering (separation/alignment/cohesion), target acquisition, combat positioning
9. **Combat System** — Per-type attack patterns, damage, knockback, AOE, special abilities (heal, shield, stun, teleport, chain lightning)
10. **Particle/Effects** — Trails, explosions, beams, lightning chains
11. **Rendering Pipeline** — 4-pass: scene → horizontal bloom → vertical bloom → composite
12. **Minimap** — Separate 160×160 canvas overlay
13. **Game Modes** — INFINITE (endless), ANNIHILATION (destroy all), BASE ASSAULT (defend/destroy bases)
14. **Main Loop** — Delta-time updates: physics → collision → projectiles → particles → reinforcements → win check → render

## Coding Conventions

- **ES5 style**: `var`, no arrow functions, no destructuring, no classes
- **Short variable names** (performance/code-golf): `u`=unit, `p`=particle, `pr`=projectile, `dt`=delta time, `d`=distance, `nn`=neighbor count, `idx`=index
- **Functional/procedural**: No classes; game objects are plain property bags
- **Global state**: Camera, pools, game state stored as top-level variables
- **Performance-first**: Object pooling, spatial hashing, instanced rendering, inline math

## Key Performance Patterns

- **Object pooling**: All units/particles/projectiles are pre-allocated; `%.alive` flag controls active state
- **Instanced rendering**: Single draw call for all objects via `ANGLE_instanced_arrays`
- **Spatial hash**: `rebuildHash()` / `queryHash()` for fast neighbor lookups — critical for collision and AI
- **Bloom pipeline**: Uses framebuffer objects (FBOs) for multi-pass post-processing

## Game Mechanics

- **Veteran system**: Units with 3+ kills get 12% speed/damage bonus
- **Team colors**: Cyan (team 0) vs Magenta (team 1); 16 color pair definitions
- **Reinforcement spawning**: Auto-spawns units when count drops below threshold (mode-dependent)
