# Renderer AGENTS.md

> WebGL 2レンダリングパイプラインの変更ガイド。略称・概要は CLAUDE.md 参照。

## ファイル責務マップ

| ファイル | 責務 | 変更頻度 |
|----------|------|----------|
| `webgl-setup.ts` | GL context取得、canvas、viewport、resize | 低 |
| `shaders.ts` | シェーダコンパイル、全program・location定義 | 中（新attrib/uniform追加時） |
| `fbo.ts` | FBO生成・リサイズ（scene + bloom×2） | 低 |
| `buffers.ts` | VAO×3（`mainVAO`/`mmVAO`/`qVAO`）、instance/minimapバッファ | 中（attrib追加時） |
| `render-scene.ts` | instanceデータ書込み（`writeInstance()`で`instanceData[]`へ9floats） | 高（描画追加時） |
| `render-pass.ts` | 4パスレンダリング（scene→bloom H→bloom V→composite） | 低 |
| `minimap.ts` | ミニマップ描画（scissor viewport内にinstanced quads）。クリックでカメラ移動（cam.targetZ=1にリセット） | 低 |

### WebGL context

`getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false })`

### VAO構成

| VAO | 用途 | バッファ |
|-----|------|----------|
| `mainVAO` | シーン描画（instanced quad + instance attribs） | `instanceBuffer` |
| `mmVAO` | ミニマップ描画（instanced quad + minimap attribs） | `minimapBuffer` |
| `qVAO` | フルスクリーンquad（bloom/composite）。`drawQuad()`で描画 | 頂点のみ |

### catalogOpen時のカメラオーバーライド

`renderFrame()`冒頭で`catalogOpen`判定:
- `cx/cy` → 0（原点固定）、`cz` → 2.5（ズーム固定）
- 通常時はカメラ位置+シェイク値を使用

## Instance Data Layout (9 floats, stride=36 bytes)

```
offset  0: x         (aO.x)
offset  4: y         (aO.y)
offset  8: size      (aS)
offset 12: r         (aC.r)
offset 16: g         (aC.g)
offset 20: b         (aC.b)
offset 24: alpha     (aC.a)
offset 28: angle     (aA)    ← mmVAOでは aSY（Y方向スケール）に転用
offset 32: shapeID   (aSh)
```

## シェーダプログラム構成

| 変数 | Vertex | Fragment | 用途 |
|------|--------|----------|------|
| `mainProgram` | main.vert | main.frag | シーン描画（instanced + SDF） |
| `bloomProgram` | quad.vert | bloom.frag | Gaussianブラー（H/V切替は`uD`で） |
| `compositeProgram` | quad.vert | composite.frag | 最終合成（vignette + Reinhard tonemap） |
| `minimapProgram` | minimap.vert | minimap.frag | ミニマップ（instanced quads） |

## 変更ガイド

### 新uniform/attribute追加
1. `shaders.ts` — `mainLocations`/`minimapLocations`/`bloomLocations`/`compositeLocations`オブジェクトにプロパティ追加
2. `shaders.ts` — `initShaders()`内で`gl.getAttribLocation()`/`gl.getUniformLocation()`
3. attribなら `buffers.ts` — VAOセットアップに`enableVertexAttribArray` + `vertexAttribPointer` + `vertexAttribDivisor`追加
4. uniformなら `render-pass.ts` — 該当passで`gl.uniform*()` 呼び出し追加

### 新エンティティの描画追加
1. `render-scene.ts` — `renderScene()`内の適切な位置に`writeInstance()`呼び出し追加
2. 描画順序: asteroids → bases → particles → beams → projectiles → units（後に描いたものが上に来る）
3. `catalogOpen`時: asteroids/basesスキップ。particles以降は常時描画
4. `MAX_INSTANCES`超過チェック: `writeInstance()`が`idx >= MAX_INSTANCES`で早期returnするため、描画が消える場合は`constants.ts`の`MAX_INSTANCES`増加を検討

### ユニット描画の付随エフェクト（render-scene.ts）

各ユニットに対し`writeInstance()`が最大5回呼ばれる:
1. `shielded` → ring(shape 5), sz×1.8, 青半透明
2. `stun > 0` → spark×2(shape 0), sz×0.7軌道上, sin回転
3. `vet > 0` → glow ring(shape 10), sz×1.4, alpha=0.08+vet×0.06
4. 本体 → 低HP flash(`hr<0.3`→sin×15), stun暗転(`sin×25`)
5. HP bar → `sz >= 10 && hr < 1`のみ(shape 0, 横長rect)
6. vet星バッジ → vet≥1: star×1, vet≥2: star×2（右上にoffset）

### ミニマップに描画追加
1. `minimap.ts` — `drawMinimap()`内に`writeMinimapInstance()`呼び出し追加
2. 座標系: ワールド座標 × `S`（= `1/WORLD_SIZE`）で正規化。`writeMinimapInstance`の引数は`(x*S, y*S, sizeX, sizeY, r, g, b, a, shapeID)`
3. 注意: `writeMinimapInstance`の第4引数`sy`がバッファoffset 7（通常`aA`）に書き込まれ、minimap.vertでは`aSY`として解釈される

### FBO変更
- `createFBOs()`はリサイズ時に再呼出しされる（`resize()`経由）
- bloomのFBOはfull解像度の半分（`>> 1`）
- フォーマットは`RGBA / UNSIGNED_BYTE` — HDRが必要なら`gl.RGBA16F`/`gl.FLOAT`に変更（テクスチャfilter/wrapとcheckFramebufferStatusも確認）
- 深度バッファ不使用（フラグメントベースの合成のみ）
- scene clear color: `(0.007, 0.003, 0.013, 1)` — ほぼ黒に微かな紫
- bloom blur半径: `uD` = `(2.5, 0)` horizontal → `(0, 2.5)` vertical
- bloom重み: `[0.227, 0.195, 0.122, 0.054, 0.016]`（中心+4サンプル）
- composite数式: `c = scene + bloom*2.0`、vignette=`1-len(vU-0.5)*0.6`、Reinhard=`c/(c+0.6)`

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `writeInstance()`のidx上限 | `MAX_INSTANCES`を超えるとサイレントに描画省略される |
| blendモードが`SRC_ALPHA, ONE`（加算） | シーンパスのみ。ミニマップは`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`（通常合成） |
| `instanceData`はサブ配列で転送 | `bufferData(instanceData.subarray(0, ic*9))` — 全体送信しない |
| attrib divisor=1 | instance属性は全て`vertexAttribDivisor(loc, 1)`必須。忘れると全instanceが同じ値に |
| DEV環境のみnullチェック | `import.meta.env.DEV`ガードでuniform location警告 |
| minimap描画後のGL状態復帰 | scissor/viewport/blendを元に戻す。新UIオーバーレイ追加時は状態復帰順に注意 |
| `bufferData`は毎フレームDYNAMIC_DRAW | `subarray`で必要分のみ送信。`MAX_INSTANCES`増加時は`buffers.ts`の`instanceData`確保も変更 |
