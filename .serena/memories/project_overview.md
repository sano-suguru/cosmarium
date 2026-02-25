# COSMARIUM - Project Overview

## Purpose
Real-time space strategy/combat simulation game. Infinite mode only — a perpetual space war simulation.

## Tech Stack
- **Language**: Vanilla TypeScript (strict mode)
- **Rendering**: HTML5 Canvas + WebGL 2 (instanced rendering, GLSL `#version 300 es`)
- **Build**: Vite + Bun (zero production dependencies)
- **Testing**: Vitest
- **Linting/Formatting**: Biome
- **Shaders**: GLSL via vite-plugin-glsl (`#include` directives)
- **Platform**: Darwin (macOS)

## Architecture
```
src/
  main.ts            # Entry point + main loop
  types.ts           # All TypeScript interfaces
  constants.ts       # Pool limits, WORLD_SIZE, CELL_SIZE
  state.ts           # Game state object (mutable properties)
  pools.ts           # Object pools + poolCounts
  colors.ts          # Team/trail color tables
  unit-types.ts      # TYPES[15] unit definitions
  shaders/           # GLSL source files
  renderer/          # WebGL 2 setup, shaders, FBO, buffers
  simulation/        # Spatial hash, spawn/kill, effects, steering, combat, update tick
  input/camera.ts    # Camera, mouse/wheel/drag
  ui/                # Codex, game controls, HUD
```

## Main Loop
`frame()` → camera lerp/shake → `update(dt*timeScale)` → `renderFrame()`

## Core Design
- Functional/procedural (no classes)
- Object pooling with `.alive` flag
- Spatial hash rebuilt every frame
- Instanced rendering with VAOs
- PRNG: mulberry32-based deterministic RNG via `rng()` in `state.ts`
