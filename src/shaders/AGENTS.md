# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。Shape IDやSDF定義は`main.frag.glsl`が正。

## #includeメカニズム

`vite-plugin-glsl`が`#include path;`を展開。`removeDuplicatedImports: true`。Biome対象外。**GPUコンパイルはランタイムのみ — CIでは検出不可。**

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| main.frag.glsl | shape ID別SDF描画。#include sdf.glsl, shape-count.glsl。最大ファイル |
| includes/sdf.glsl | hexDist, octDist, manDist |
| includes/shape-count.glsl | `#define NUM_SHAPES 28` — 4配列サイズ+clampの一元管理 |
| main.vert.glsl | インスタンス頂点シェーダ。aP/aO/aS/aA/aSh/aCを受取 |
| bloom.frag.glsl | H/Vガウス畳み込み。uT,uD,uR |
| composite.frag.glsl | vignette + Reinhardトーンマップ。uS,uB |
| minimap.vert.glsl | ミニマップ頂点。aSYはaAスロット転用 |
| minimap.frag.glsl | SDF不使用。色をそのまま出力 |
| quad.vert.glsl | bloom/composite用フルスクリーンquad |

## Shape IDs

フラグメントシェーダ (`main.frag.glsl`) が整数shape IDでSDF描画を分岐する:

| ID | Shape | Used by |
|----|-------|---------|
| 0 | Circle | particle, projectile(aoe/default), HP bar, stun spark |
| 1 | Diamond | projectile(通常弾), minimap背景/unit |
| 2 | Triangle | — |
| 3 | Hexagon | asteroid |
| 4 | Cross | — |
| 5 | Ring | reflector shield表示 |
| 6 | Arrow | homing projectile, minimap unit |
| 7 | Star(5) | — |
| 8 | Crescent | — |
| 9 | Square | — |
| 10 | Glow ring | explosion ring, vet glow, EMP ring, shield aura, base glow |
| 11 | Chevron | — |
| 12 | Beam | beam segments |
| 13 | Diamond ring | — |
| 14 | Trefoil | — |
| 15 | Lightning | — |
| 16 | Pentagon | — |
| 20 | Large hexagon | base (mode=2) |
| 21 | Bar | HPバー (背景+前景) |
| 22 | Octagon shield | reflectorシールド/shield linger |
| 23 | Lightning beam | チェーンライトニングのビームセグメント |
| 24 | Flagship Dreadnought | Flagship |
| 25 | Medical Frigate | Healer |
| 26 | Prism Shield | Reflector |
| 27 | Reflect Field | Reflector味方フィールド |

## 新Shape追加手順

1. `includes/shape-count.glsl` の `NUM_SHAPES` を +1
2. `main.frag.glsl` — 4配列（RIM_THRESH, RIM_WEIGHT, HF_WEIGHT, FWIDTH_MULT）に要素を追加
3. `main.frag.glsl` — 最後の`else if`の前に`else if(sh==次のID)`を追加
4. SDF関数が必要なら`includes/sdf.glsl`に追加（既存: `hexDist`, `octDist`, `manDist`）
5. `unit-types.ts` — 該当ユニットの`sh`に新IDを設定
6. 描画確認はブラウザのみ

> `minimap.frag.glsl`は変更不要 — SDFを使わず色をそのまま出力するため。

## Critical Gotchas

- `int sh=int(vSh+0.5)` — floatからint変換の精度対策
- `aSY`は`aA`スロット転用（minimap.vertのみ。バッファレイアウトは同一だが意味が異なる）
- GLSL構文エラーはランタイムのみ検出（`gl.compileShader`失敗=黒画面）
