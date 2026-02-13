# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。Shape IDやSDF定義は`main.frag.glsl`が正。

## #includeメカニズム

`vite-plugin-glsl`が`#include path;`を展開。`removeDuplicatedImports: true`。Biome対象外。**GPUコンパイルはランタイムのみ — CIでは検出不可。**

## 新Shape追加手順

1. `main.frag.glsl` — 最後の`else if`の前に`else if(sh==次のID)`を追加
2. SDF関数が必要なら`includes/sdf.glsl`に追加（既存: `hexDist`, `manDist`, `polarR`）
3. `unit-types.ts` — 該当ユニットの`sh`に新IDを設定
4. 描画確認はブラウザのみ

> `minimap.frag.glsl`は変更不要 — SDFを使わず色をそのまま出力するため。

## Critical Gotchas

- `int sh=int(vSh+0.5)` — floatからint変換の精度対策
- `aSY`は`aA`スロット転用（minimap.vertのみ。バッファレイアウトは同一だが意味が異なる）
- GLSL構文エラーはランタイムのみ検出（`gl.compileShader`失敗=黒画面）
