# Renderer AGENTS.md

> WebGL2レンダリングの変更ガイド。数値はソースコード参照。

## パイプライン概要

4パス: scene(加算blend) → bloom H → bloom V → composite(vignette+Reinhard)。VAO3つ: `mainVAO`(シーン), `mmVAO`(ミニマップ), `qVAO`(フルスクリーンquad)。

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| render-scene.ts | renderScene()エントリポイント。renderUnits/Particles/Projectilesを呼出し |
| render-write.ts | writeInstance/writeOverlay/カリング判定。共有バッファ書込み状態を管理 |
| render-beams.ts | renderBeams/renderTrackingBeams/renderLightningBeam。WRAP_PERIODをエクスポート |
| render-overlays.ts | renderOverlays/renderBuffOverlays/renderHpBar/renderStunStars等オーバーレイ描画 |
| shaders.ts | GLSLインポート→compile→link。mainLocations/bloomLocations等を公開 |
| minimap.ts | initMinimap + drawMinimap。scissor/viewport切替、mmVAO使用 |
| buffers.ts | VAO3つ(mainVAO/mmVAO/qVAO)初期化。instanceData Float32Array確保 |
| render-pass.ts | renderFrame()：4パス制御。uniform設定、FBOバインド |
| fbo.ts | FBO生成/削除。scene(フル解像度)/bloom1,bloom2(半分解像度) |
| webgl-setup.ts | Canvas取得(#c)、WebGL2コンテキスト初期化、resize() |
| utils.ts | required() — WebGLリソース生成失敗チェック |

テスト: `render-scene.test.ts` — writeInstance/描画順/instanceData書込みの検証。render-write.tsの関数を使用。

## 変更ガイド

### 新attrib/uniform追加
`shaders.ts`(location定義+get) → attribなら`buffers.ts`(VAOセットアップ、`vertexAttribDivisor(loc,1)`必須) → uniformなら`render-pass.ts`

### 新エンティティ描画追加
`render-scene.ts`の`renderScene()`に`writeInstance()`追加。描画順: particles→beams→projectiles→units。`MAX_INSTANCES`超過で描画消失→`constants.ts`の値を確認。

### ミニマップ描画追加
`minimap.ts`の`drawMinimap()`に`writeMinimap()`追加。座標=ワールド×`1/WORLD_SIZE`で正規化。

## Critical Gotchas

- blendモード: シーン=`SRC_ALPHA, ONE`(加算)、ミニマップ=`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`(通常)。混同注意
- シェーダコンパイルエラーは`devError()`で報告→黒画面。CIでは検出不可

## 初期化順序（main.tsから）
`initWebGL()` → `initShaders()` → `setOnResized(createFBOs)` → `createFBOs()` → `initBuffers()` — 順序変更不可。`resize()` は `onResized` コールバック経由で `createFBOs()` を自動呼び出し
