---
paths:
  - "src/shaders/**"
---

# Shader Rules

## Add a New Shape

Shape IDs are **append-only** — never reuse or reassign existing IDs. Units 0-18, Effects 19+.

1. `includes/shape-count.glsl`: increment `NUM_SHAPES`
2. `includes/shape-params.glsl`: add entry to 5 arrays (RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT, SOFT_LIMIT)
3. Add SDF in `unit-shapes.glsl` or `effect-shapes.glsl` with `// [SHAPE:ID Name]` marker
4. `unit-types.ts`: set `shape` to new ID
5. Verify: `bunx vitest run src/shaders/shape-sync.test.ts` + browser visual check

## GLSL Gotchas

- GPU-only, runtime only. No CI validation. Test shader changes in browser.
- `src/shaders/**` excluded from Biome lint/format.
