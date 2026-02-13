# COSMARIUM Key Symbols Reference

Frequently investigated symbols organized by module. Use LSP `references` and `definition` to navigate these.

## Pool Functions (src/pools.ts, src/simulation/spawn.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `unitPool` | `Unit[]` | Unit pool array |
| `particlePool` | `Particle[]` | Particle pool array |
| `projectilePool` | `Projectile[]` | Projectile pool array |
| `poolCounts` | `object` | Active counts: `unitCount`, `particleCount`, `projectileCount` |
| `spawnUnit` | `function` | Spawn unit |
| `spawnParticle` | `function` | Spawn particle |
| `spawnProjectile` | `function` | Spawn projectile |
| `killUnit` | `function` | Kill unit + spawn explosion |

## State (src/state.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `gameState` | `GameState` | 'menu', 'play', 'win' |
| `gameMode` | `GameMode` | 0=infinite, 1=annihilation, 2=base |
| `beams` | `Beam[]` | Active beam array |
| `timeScale` | `number` | Simulation speed multiplier |
| `catalogOpen` | `boolean` | Catalog UI state |
| `reinforcementTimer` | `number` | Reinforcement timer |

State uses setter functions: `setGameState()`, `setGameMode()`, `setCatalogOpen()`, `setReinforcementTimer()`, etc.

## Renderer (src/renderer/)

| Symbol | Type | File | Description |
|--------|------|------|-------------|
| `gl` | `WebGL2RenderingContext` | webgl-setup.ts | WebGL context |
| `canvas` | `HTMLCanvasElement` | webgl-setup.ts | Canvas element |
| `viewport` | `{W,H}` | webgl-setup.ts | Viewport dimensions |
| `mainProgram` | `WebGLProgram` | shaders.ts | Main shader program |
| `bloomProgram` | `WebGLProgram` | shaders.ts | Bloom shader program |
| `compositeProgram` | `WebGLProgram` | shaders.ts | Composite shader program |
| `minimapProgram` | `WebGLProgram` | shaders.ts | Minimap shader program |
| `mainLocations` | `object` | shaders.ts | Main program locations |
| `minimapLocations` | `object` | shaders.ts | Minimap program locations |
| `fbos` | `object` | fbo.ts | FBO references (scene, bloom1, bloom2) |
| `instanceData` / `instanceBuffer` | `Float32Array` / `WebGLBuffer` | buffers.ts | Scene instance data |
| `minimapData` / `minimapBuffer` | `Float32Array` / `WebGLBuffer` | buffers.ts | Minimap instance data |

## Simulation (src/simulation/)

| Symbol | Type | File | Description |
|--------|------|------|-------------|
| `buildHash` | `function` | spatial-hash.ts | Rebuild spatial hash |
| `getNeighbors` | `function` | spatial-hash.ts | Get neighbors |
| `knockback` | `function` | spatial-hash.ts | Apply knockback |
| `neighborBuffer` | `number[]` | spatial-hash.ts | Neighbor buffer (350 elements) |
| `steer` | `function` | steering.ts | Boid steering + target AI |
| `combat` | `function` | combat.ts | Combat processing |
| `reinforce` | `function` | reinforcements.ts | Spawn reinforcements |
| `update` | `function` | update.ts | Main simulation tick |

## Camera (src/input/camera.ts)

| Symbol | Type | Description |
|--------|------|-------------|
| `cam` | `Camera` | Camera state: x/y/z, targetX/targetY/targetZ, shake/shakeX/shakeY |
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
| `teamColors` | `number[][][]` | Team colors per unit type |
| `trailColors` | `number[][][]` | Trail colors per unit type |
| `getColor` | `function` | Get color: `(typeIdx, team) => [r,g,b]` |
| `getTrailColor` | `function` | Get trail color |

## Constants (src/constants.ts)

| Symbol | Value | Description |
|--------|-------|-------------|
| `POOL_UNITS` | `800` | Max units pool |
| `POOL_PARTICLES` | `35000` | Max particles pool |
| `POOL_PROJECTILES` | `6000` | Max projectiles pool |
| `WORLD_SIZE` | `4000` | World size |
| `CELL_SIZE` | `100` | Spatial hash cell size |
| `STRIDE_BYTES` | `36` | Instance data stride (bytes, 9 floats × 4) |
