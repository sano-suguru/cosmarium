# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。Shape定義は`includes/shapes/`配下のファイルが正。

## #includeメカニズム

`vite-plugin-glsl`が`#include path;`を展開。`removeDuplicatedImports: true`。Biome対象外。**GPUコンパイルはランタイムのみ — CIでは検出不可。**

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| main.frag.glsl | #include + main()。shape-params.glslとshape-util.glslを読み込み |
| includes/shape-params.glsl | 5配列(RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT, SOFT_LIMIT) |
| includes/shapes/unit-shapes.glsl | ユニットshape SDF (sh==0〜19)。`[SHAPE:ID Name]`マーカー付き |
| includes/shapes/effect-shapes.glsl | エフェクトshape SDF (sh==32〜42)。`[SHAPE:ID Name]`マーカー付き |
| includes/shape-util.glsl | softClamp, shapeSoftClamp, shapeBase, shapeRim, shapeAA |
| includes/sdf.glsl | hexDist, octDist, manDist |
| includes/shape-count.glsl | `#define NUM_SHAPES 43` — 配列サイズ+clampの一元管理 |
| shape-sync.test.ts | NUM_SHAPES同期バリデーション（GLSL↔TS） |
| main.vert.glsl | インスタンス頂点シェーダ。aP/aO/aS/aA/aSh/aCを受取 |
| bloom.frag.glsl | H/Vガウス畳み込み。uT,uD,uR |
| composite.frag.glsl | vignette + Reinhardトーンマップ。uS,uB |
| minimap.vert.glsl | ミニマップ頂点。aSYはaAスロット転用 |
| minimap.frag.glsl | SDF不使用。色をそのまま出力 |
| quad.vert.glsl | bloom/composite用フルスクリーンquad |

## Shape IDs

フラグメントシェーダ (`main.frag.glsl`) が整数shape IDでSDF描画を分岐する:

ユニットシェイプ = TYPES配列インデックス (0–19)、エフェクト = `EFFECT_SHAPE_BASE` (32) から連番 (32–42)。20–31 は将来のユニット用に予約。`shape-sync.test.ts` が検証。IDの再利用禁止。ユニット追加してもエフェクトIDは不変。

| ID | Shape | Used by |
|----|-------|---------|
| 0 | Drone | unit |
| 1 | Fighter | unit |
| 2 | Bomber | unit |
| 3 | Cruiser | unit |
| 4 | Flagship | unit |
| 5 | Healer | unit |
| 6 | Reflector | unit |
| 7 | Carrier | unit |
| 8 | Sniper | unit |
| 9 | Lancer | unit |
| 10 | Launcher | unit |
| 11 | Disruptor | unit |
| 12 | Scorcher | unit |
| 13 | Teleporter | unit |
| 14 | Arcer | unit |
| 15 | Bastion | unit |
| 16 | Amplifier | unit |
| 17 | Scrambler | unit |
| 18 | Catalyst | unit |
| 19 | Mothership | unit |
| 20–31 | (reserved) | 将来のユニット用 |
| 32 | Circle (SH_CIRCLE) | particle, projectile(aoe), stun spark |
| 33 | Diamond (SH_DIAMOND) | projectile(通常弾) |
| 34 | Homing (SH_HOMING) | homing projectile |
| 35 | Beam (SH_BEAM) | beam segments |
| 36 | Lightning (SH_LIGHTNING) | チェーンライトニングのビームセグメント |
| 37 | Explosion Ring (SH_EXPLOSION_RING) | explosion ring, vet glow, EMP ring, shield aura |
| 38 | Diamond Ring (SH_DIAMOND_RING) | scramble debuff overlay |
| 39 | Octagon Shield (SH_OCT_SHIELD) | shield linger, Bastion shield |
| 40 | Reflect Field (SH_REFLECT_FIELD) | Reflector味方フィールド |
| 41 | Bar (SH_BAR) | HPバー (背景+前景) |
| 42 | Trail (SH_TRAIL) | ユニット軌跡エフェクト |

## セクションマーカー規約

各shapeブロックの直前に `// [SHAPE:ID Name]` マーカーを記述する:

```glsl
  // [SHAPE:13 Teleporter] ————————————————————————————
  else if(sh==13){ vec2 p=vU*0.66; ...
```

- `grep '\[SHAPE:13'` で該当shapeに即座にジャンプ可能
- 5配列のコメントも `[ID:Name]` 形式で統一（例: `// [0:Drone] [1:Fighter] ...`）

## 新Shape追加手順

1. `includes/shape-count.glsl` の `NUM_SHAPES` を +1
2. `includes/shape-params.glsl` — 5配列（RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT, SOFT_LIMIT）に要素を追加
3. ユニットshapeなら `includes/shapes/unit-shapes.glsl`、エフェクトなら `includes/shapes/effect-shapes.glsl` に `else if(sh==次のID)` を追加。直前に `// [SHAPE:ID Name]` マーカーを付与
4. SDF関数が必要なら`includes/sdf.glsl`に追加（既存: `hexDist`, `octDist`, `manDist`）
5. `unit-types.ts` — 該当ユニットの`shape`に新IDを設定
6. `bunx vitest run src/shaders/shape-sync.test.ts` で同期テスト通過を確認
7. 描画確認はブラウザのみ

> `minimap.frag.glsl`は変更不要 — SDFを使わず色をそのまま出力するため。

## Critical Gotchas

- `aSY`は`aA`スロット転用（minimap.vertのみ。バッファレイアウトは同一だが意味が異なる）
- GLSL構文エラーはランタイムのみ検出（`gl.compileShader`失敗=黒画面）
