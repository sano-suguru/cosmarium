# Renderer AGENTS.md

> WebGL2レンダリングの変更ガイド。数値はソースコード参照。

## パイプライン概要

4パス: scene(加算blend) → bloom H → bloom V → composite(vignette+Reinhard)。VAO3つ: `mainVAO`(シーン), `mmVAO`(ミニマップ), `qVAO`(フルスクリーンquad)。

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| render-scene.ts | writeInstance()でinstanceDataに書込み。描画順制御 |
| shaders.ts | GLSLインポート→compile→link。mainLocations/bloomLocations等を公開 |
| minimap.ts | initMinimap + drawMinimap。scissor/viewport切替、mmVAO使用 |
| buffers.ts | VAO3つ(mainVAO/mmVAO/qVAO)初期化。instanceData Float32Array確保 |
| render-pass.ts | renderFrame()：4パス制御。uniform設定、FBOバインド |
| fbo.ts | FBO生成/削除。scene(フル解像度)/bloom1,bloom2(半分解像度) |
| webgl-setup.ts | Canvas取得(#c)、WebGL2コンテキスト初期化、resize() |
| utils.ts | required() — WebGLリソース生成失敗チェック |

テスト: `render-scene.test.ts` — writeInstance/描画順/instanceData書込みの検証。

## 変更ガイド

### 新attrib/uniform追加
`shaders.ts`(location定義+get) → attribなら`buffers.ts`(VAOセットアップ、`vertexAttribDivisor(loc,1)`必須) → uniformなら`render-pass.ts`

### 新エンティティ描画追加
`render-scene.ts`の`renderScene()`に`writeInstance()`追加。描画順: particles→beams→projectiles→units。`MAX_INSTANCES`超過で描画消失→`constants.ts`の値を確認。

### ミニマップ描画追加
`minimap.ts`の`drawMinimap()`に`writeMinimap()`追加。座標=ワールド×`1/WORLD_SIZE`で正規化。

## Critical Gotchas

- blendモード: シーン=`SRC_ALPHA, ONE`(加算)、ミニマップ=`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`(通常)。混同注意
- `attribDivisor(loc, 1)`必須。忘れると全instanceが同値に
- `instanceData`は`subarray(0, ic*9)`で必要分のみ転送。全体送信しない
- minimap描画後はscissor/viewport/blendをリストア必須
- instance layout: 9 floats/stride=36bytes。offset 28の`aA`はmmVAOでは`aSY`(Y-scale)に転用
- `resize()`後に`createFBOs()`を再呼出し必須（FBOサイズはviewportに依存）
- シェーダコンパイルエラーは`devError()`で報告→黒画面。CIでは検出不可

## 初期化順序（main.tsから）
`initWebGL()` → `initShaders()` → `createFBOs()` → `initBuffers()` — 順序変更不可
