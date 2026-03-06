---
paths:
  - "src/**/*.ts"
---

# Change Guides

## Add a New Unit Type

`unit-types.ts` → `types.ts` (if new flags) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts` (if special movement) → `simulation/spawn.ts` (if new properties) → `ui/codex.ts` → `src/shaders/main.frag.glsl` (new shape)

## Add an Effect

Add function to `simulation/effects.ts` → import at call site.
