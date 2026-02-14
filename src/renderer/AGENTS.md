# Renderer AGENTS.md

> WebGL2レンダリングの変更ガイド。数値はソースコード参照。

## パイプライン概要

4パス: scene(加算blend) → bloom H → bloom V → composite(vignette+Reinhard)。VAO3つ: `mainVAO`(シーン), `mmVAO`(ミニマップ), `qVAO`(フルスクリーンquad)。

## 変更ガイド

### 新attrib/uniform追加
`shaders.ts`(location定義+get) → attribなら`buffers.ts`(VAOセットアップ、`vertexAttribDivisor(loc,1)`必須) → uniformなら`render-pass.ts`

### 新エンティティ描画追加
`render-scene.ts`の`renderScene()`に`writeInstance()`追加。描画順: bases→particles→beams→projectiles→units。`codexOpen`時はbasesスキップ。`MAX_INSTANCES`超過で描画消失→`constants.ts`の値を確認。

### ミニマップ描画追加
`minimap.ts`の`drawMinimap()`に`writeMinimapInstance()`追加。座標=ワールド×`1/WORLD_SIZE`で正規化。

## Critical Gotchas

- blendモード: シーン=`SRC_ALPHA, ONE`(加算)、ミニマップ=`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`(通常)。混同注意
- `attribDivisor(loc, 1)`必須。忘れると全instanceが同値に
- `instanceData`は`subarray(0, ic*9)`で必要分のみ転送。全体送信しない
- minimap描画後はscissor/viewport/blendをリストア必須
- instance layout: 9 floats/stride=36bytes。offset 28の`aA`はmmVAOでは`aSY`(Y-scale)に転用
