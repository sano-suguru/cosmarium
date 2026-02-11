# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。プログラム構成は `src/renderer/AGENTS.md` 参照。

## ファイル構成

| ファイル | 用途 | 備考 |
|----------|------|------|
| `main.vert.glsl` | シーン頂点: 回転→ワールド→カメラ変換 | instanced。`aA`=回転角度 |
| `main.frag.glsl` | SDF描画: shapeID別の分岐（全18形状） | `#include includes/sdf.glsl` |
| `quad.vert.glsl` | フルスクリーンquad頂点 | bloom + composite共用 |
| `bloom.frag.glsl` | 1D Gaussianブラー | `uD`でH/V切替 |
| `composite.frag.glsl` | bloom合成 + vignette + Reinhard tonemap | |
| `minimap.vert.glsl` | ミニマップ頂点（回転なし、Y-scale対応） | `aSY`スロット = `aA`スロット転用 |
| `minimap.frag.glsl` | ミニマップ用簡易描画（色パススルー） | SDF分岐なし。circle以外はdiscardなし |
| `includes/sdf.glsl` | 共有SDF関数: `hexDist`, `manDist`, `polarR` | `#include`で取り込み |

## #includeメカニズム

- `vite-plugin-glsl`が`#include path;`を展開（Cプリプロセッサではない）
- `removeDuplicatedImports: true`設定 → 複数ファイルから同じincludeしても重複しない
- ESLint・Prettierの対象外（`.eslintrc`と`.prettierignore`で除外済み）
- **GPUコンパイルはランタイムのみ** — CI/typecheckでは検出不可。ブラウザで確認必須

## Shape ID → SDF マッピング

| ID | 形状 | SDF手法 | 使用ユニット例 |
|----|------|---------|---------------|
| 0 | circle | `length(vU)` | particle, basic |
| 1 | diamond | `manDist` | — |
| 2 | triangle | 横グラデーション幅 | — |
| 3 | hexagon | `hexDist` | — |
| 4 | cross | step(x)+step(y) | — |
| 5 | ring | `abs(d-0.7)` | — |
| 6 | arrow | 三角+矩形body | — |
| 7 | star(5) | `polarR(5)` | — |
| 8 | crescent | 2円の差分 | — |
| 9 | square | `max(abs.x,abs.y)` | — |
| 10 | glow ring | `exp(-ring*8)` | — |
| 11 | chevron | `step(by,bx*0.8)` | — |
| 12 | beam | `exp(-by*6)` | beam |
| 13 | diamond ring | `manDist`中空 | — |
| 14 | trefoil | `polarR(3)` | — |
| 15 | lightning | 斜めexp | — |
| 16 | pentagon | 5角形cos分割 | — |
| 20 | large hexagon | `hexDist`+強glow | base |

## 新Shape追加手順

1. `main.frag.glsl` — 最後の`else if`の前に`else if(sh==次のID)`を追加
2. SDF関数が必要なら`includes/sdf.glsl`に追加（既存: `hexDist`, `manDist`, `polarR`）
3. `unit-types.ts` — 該当ユニットの`sh`に新IDを設定
4. 描画確認はブラウザのみ（CIでは検証不可）

> `minimap.frag.glsl`は変更不要 — SDFを使わず色をそのまま出力するため。

## Instance Attribute Layout

```
main.vert: aP(vec2) aO(vec2) aS(float) aC(vec4) aA(float) aSh(float) → 9 floats, stride=36
minimap.vert: aP(vec2) aO(vec2) aS(float) aC(vec4) aSY(float) aSh(float) → 同レイアウト、aA→aSY転用
```

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| minimap.fragにはSDF分岐がない | main.fragのみにShape分岐がある。minimap.fragは色パススルーのため変更不要 |
| `int sh=int(vSh+0.5)` | floatからint変換。精度対策で+0.5 |
| `aSY`は`aA`スロット転用 | minimap.vertのみ。バッファレイアウトは同一だが意味が異なる |
| GLSL構文エラーはランタイム | `gl.compileShader`失敗 = 黒画面。CIでは検出不可 |
