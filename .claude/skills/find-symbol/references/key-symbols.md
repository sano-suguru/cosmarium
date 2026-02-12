# COSMARIUM Key Symbols Reference

Frequently investigated symbols organized by module. Use LSP `references` and `definition` to navigate these.

## Pool Functions (src/pools.ts, src/simulation/spawn.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `uP` | `Unit[]` | Unit pool array |
| `pP` | `Particle[]` | Particle pool array |
| `prP` | `Projectile[]` | Projectile pool array |
| `poolCounts` | `object` | Active counts: `uC`, `pC`, `prC` |
| `spU` | `function` | Spawn unit |
| `spP` | `function` | Spawn particle |
| `spPr` | `function` | Spawn projectile |
| `killU` | `function` | Kill unit + spawn explosion |

## State (src/state.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `gameState` | `number` | 0=menu, 1=playing, 2=gameover |
| `gameMode` | `number` | 0=infinite, 1=annihilation, 2=base |
| `beams` | `Beam[]` | Active beam array |
| `timeScale` | `number` | Simulation speed multiplier |
| `catalogOpen` | `boolean` | Catalog UI state |
| `rT` | `number` | Reinforcement timer |

State uses setter functions: `setGameState()`, `setGameMode()`, `setCatalogOpen()`, etc.

## Renderer (src/renderer/)

| Symbol | Type | File | Description |
|--------|------|------|-------------|
| `gl` | `WebGL2RenderingContext` | webgl-setup.ts | WebGL context |
| `canvas` | `HTMLCanvasElement` | webgl-setup.ts | Canvas element |
| `viewport` | `{W,H}` | webgl-setup.ts | Viewport dimensions |
| `mP` | `WebGLProgram` | shaders.ts | Main shader program |
| `blP` | `WebGLProgram` | shaders.ts | Bloom shader program |
| `coP` | `WebGLProgram` | shaders.ts | Composite shader program |
| `mmP` | `WebGLProgram` | shaders.ts | Minimap shader program |
| `Loc` | `object` | shaders.ts | Main program locations |
| `mmLoc` | `object` | shaders.ts | Minimap program locations |
| `fbos` | `object` | fbo.ts | FBO references (sF, bF1, bF2) |
| `iD` / `iB` | `Float32Array` / `WebGLBuffer` | buffers.ts | Scene instance data |
| `mmD` / `mmB` | `Float32Array` / `WebGLBuffer` | buffers.ts | Minimap instance data |

## Simulation (src/simulation/)

| Symbol | Type | File | Description |
|--------|------|------|-------------|
| `bHash` | `function` | spatial-hash.ts | Rebuild spatial hash |
| `gN` | `function` | spatial-hash.ts | Get neighbors |
| `kb` | `function` | spatial-hash.ts | Apply knockback |
| `_nb` | `number[]` | spatial-hash.ts | Neighbor buffer (350 elements) |
| `steer` | `function` | steering.ts | Boid steering + target AI |
| `combat` | `function` | combat.ts | Combat processing |
| `reinforce` | `function` | reinforcements.ts | Spawn reinforcements |
| `update` | `function` | update.ts | Main simulation tick |

## Camera (src/input/camera.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `cam` | `object` | Camera state: x/y/z, tx/ty/tz, shk/shkx/shky |
| `addShake` | `function` | Add screen shake |

## Types (src/types.ts)

| Symbol | Kind | Description |
|--------|------|-------------|
| `Unit` | `interface` | Game unit with position, health, team, etc. |
| `Particle` | `interface` | Visual particle |
| `Projectile` | `interface` | Combat projectile |
| `Beam` | `interface` | Beam weapon visual |
| `Team` | `type` | `0 | 1` union type |
| `UnitType` | `interface` | Unit type definition |

## Colors (src/colors.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `TC` | `number[][][]` | Team colors per unit type |
| `TrC` | `number[][][]` | Trail colors per unit type |
| `gC` | `function` | Get color: `(typeIdx, team) => [r,g,b]` |
| `gTr` | `function` | Get trail color |

## Constants (src/constants.ts)

| Symbol | Value | Description |
|--------|-------|-------------|
| `PU` | `800` | Max units pool |
| `PP` | `35000` | Max particles pool |
| `PPR` | `6000` | Max projectiles pool |
| `WORLD` | `4000` | World size |
| `CELL` | `100` | Spatial hash cell size |
| `S_STRIDE` | `9` | Instance data stride (floats) |
