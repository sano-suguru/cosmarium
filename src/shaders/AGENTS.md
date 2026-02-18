# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。Shape IDやSDF定義は`main.frag.glsl`が正。

## #includeメカニズム

`vite-plugin-glsl`が`#include path;`を展開。`removeDuplicatedImports: true`。Biome対象外。**GPUコンパイルはランタイムのみ — CIでは検出不可。**

## ファイル一覧

| ファイル | 行数 | 役割 |
|---------|------|------|
| main.vert.glsl | 14 | インスタンス頂点シェーダ。aP/aO/aS/aA/aSh/aCを受取 |
| main.frag.glsl | 72 | shape ID別SDF描画。#include sdf.glsl |
| quad.vert.glsl | 4 | bloom/composite用フルスクリーンquad |
| bloom.frag.glsl | 14 | H/Vガウス畳み込み。uT,uD,uR |
| composite.frag.glsl | 12 | vignette + Reinhardトーンマップ。uS,uB |
| minimap.vert.glsl | 11 | ミニマップ頂点。aSYはaAスロット転用 |
| minimap.frag.glsl | 9 | SDF不使用。色をそのまま出力 |
| includes/sdf.glsl | 24 | hexDist, octDist, manDist, polarR |

## 新Shape追加手順

1. `main.frag.glsl` — 最後の`else if`の前に`else if(sh==次のID)`を追加
2. SDF関数が必要なら`includes/sdf.glsl`に追加（既存: `hexDist`, `manDist`, `polarR`）
3. `unit-types.ts` — 該当ユニットの`sh`に新IDを設定
4. 描画確認はブラウザのみ

> `minimap.frag.glsl`は変更不要 — SDFを使わず色をそのまま出力するため。

## Critical Gotchas

- vite-plugin-glslの`removeDuplicatedImports: true`設定により、同一ファイルの重複#includeは自動除去される
- `int sh=int(vSh+0.5)` — floatからint変換の精度対策
- `aSY`は`aA`スロット転用（minimap.vertのみ。バッファレイアウトは同一だが意味が異なる）
- GLSL構文エラーはランタイムのみ検出（`gl.compileShader`失敗=黒画面）
