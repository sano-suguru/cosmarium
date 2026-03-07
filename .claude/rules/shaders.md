---
paths:
  - "src/shaders/**"
---

# Shader Rules

## Add a New Shape

ユニットシェイプ = TYPES配列インデックス (0-19)、エフェクト = `EFFECT_SHAPE_BASE` (32) から連番 (32-42)。20-31 は将来のユニット用に予約。`shape-sync.test.ts` が検証。IDの再利用禁止。

1. `includes/shape-count.glsl`: increment `NUM_SHAPES`
2. `includes/shape-params.glsl`: 各配列の `[20-31: reserved]` パディング先頭を新ユニットの値に置き換え、要素数を1つ減らす（5配列すべて: RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT, SOFT_LIMIT）
3. Add SDF in `unit-shapes.glsl` or `effect-shapes.glsl` with `// [SHAPE:ID Name]` marker
4. `unit-types.ts`: set `shape` to new ID
5. Verify: `bunx vitest run src/shaders/shape-sync.test.ts` + browser visual check

## GLSL Gotchas

- GPU-only, runtime only. No CI validation. Test shader changes in browser.
- `src/shaders/**` excluded from Biome lint/format.
