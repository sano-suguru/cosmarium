# Renderer AGENTS.md

> WebGL2レンダリングの変更ガイド。数値はソースコード参照。

## パイプライン概要

4パス: scene(加算blend) → bloom H → bloom V → composite(vignette+Reinhard)。VAO3つ: `mainVAO`(シーン), `mmVAO`(ミニマップ), `qVAO`(フルスクリーンquad)。

## ファイル一覧

| ファイル | 行数 | 役割 |
|---------|------|------|
| webgl-setup.ts | 34 | Canvas取得(#c)、WebGL2コンテキスト初期化、resize() |
| shaders.ts | 126 | GLSLインポート→compile→link。mainLocations/bloomLocations等を公開 |
| buffers.ts | 106 | VAO3つ(mainVAO/mmVAO/qVAO)初期化。instanceData Float32Array確保 |
| fbo.ts | 42 | FBO生成/削除。scene(フル解像度)/bloom1,bloom2(半分解像度) |
| render-pass.ts | 95 | renderFrame()：4パス制御。uniform設定、FBOバインド |
| render-scene.ts | 289 | writeInstance()でinstanceDataに書込み。描画順制御 |
| minimap.ts | 110 | initMinimap + drawMinimap。scissor/viewport切替、mmVAO使用 |
| utils.ts | 5 | required() — WebGLリソース生成失敗チェック |

## 変更ガイド

### 新attrib/uniform追加
`shaders.ts`(location定義+get) → attribなら`buffers.ts`(VAOセットアップ、`vertexAttribDivisor(loc,1)`必須) → uniformなら`render-pass.ts`

### 新エンティティ描画追加
`render-scene.ts`の`renderScene()`に`writeInstance()`追加。描画順: particles→beams→projectiles→units。`MAX_INSTANCES`超過で描画消失→`constants.ts`の値を確認。

### ミニマップ描画追加
`minimap.ts`の`drawMinimap()`に`writeMinimapInstance()`追加。座標=ワールド×`1/WORLD_SIZE`で正規化。

## Critical Gotchas

- blendモード: シーン=`SRC_ALPHA, ONE`(加算)、ミニマップ=`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`(通常)。混同注意
- `attribDivisor(loc, 1)`必須。忘れると全instanceが同値に
- `instanceData`は`subarray(0, ic*9)`で必要分のみ転送。全体送信しない
- minimap描画後はscissor/viewport/blendをリストア必須
- instance layout: 9 floats/stride=36bytes。offset 28の`aA`はmmVAOでは`aSY`(Y-scale)に転用
- `resize()`後に`createFBOs()`を再呼出し必須（FBOサイズはviewportに依存）
- シェーダコンパイルエラーは`devError()`で報告→黒画面。CIでは検出不可（詳細: `src/shaders/AGENTS.md`）

## 初期化順序（main.tsから）
`initWebGL()` → `initShaders()` → `createFBOs()` → `initBuffers()` — 順序変更不可
