# Shaders AGENTS.md

> GLSLシェーダの変更ガイド。Shape IDやSDF定義は`main.frag.glsl`が正。

## #includeメカニズム

`vite-plugin-glsl`が`#include path;`を展開。`removeDuplicatedImports: true`。Biome対象外。**GPUコンパイルはランタイムのみ — CIでは検出不可。**

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| main.frag.glsl | shape ID別SDF描画。#include sdf.glsl, shape-count.glsl。最大ファイル |
| includes/sdf.glsl | hexDist, octDist, manDist |
| includes/shape-count.glsl | `#define NUM_SHAPES 29` — 4配列サイズ+clampの一元管理 |
| main.vert.glsl | インスタンス頂点シェーダ。aP/aO/aS/aA/aSh/aCを受取 |
| bloom.frag.glsl | H/Vガウス畳み込み。uT,uD,uR |
| composite.frag.glsl | vignette + Reinhardトーンマップ。uS,uB |
| minimap.vert.glsl | ミニマップ頂点。aSYはaAスロット転用 |
| minimap.frag.glsl | SDF不使用。色をそのまま出力 |
| quad.vert.glsl | bloom/composite用フルスクリーンquad |

## Shape IDs

フラグメントシェーダ (`main.frag.glsl`) が整数shape IDでSDF描画を分岐する:

安定ID運用（append-only）: 既存IDの変更・再利用は禁止。新ユニット/エフェクト追加時は末尾に追番。Units 0–18, Effects 19–28。

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
| 19 | Circle (SH_CIRCLE) | particle, projectile(aoe), stun spark |
| 20 | Diamond (SH_DIAMOND) | projectile(通常弾) |
| 21 | Homing (SH_HOMING) | homing projectile |
| 22 | Beam (SH_BEAM) | beam segments |
| 23 | Lightning (SH_LIGHTNING) | チェーンライトニングのビームセグメント |
| 24 | Explosion Ring (SH_EXPLOSION_RING) | explosion ring, vet glow, EMP ring, shield aura |
| 25 | Diamond Ring (SH_DIAMOND_RING) | scramble debuff overlay |
| 26 | Octagon Shield (SH_OCT_SHIELD) | shield linger, Bastion shield |
| 27 | Reflect Field (SH_REFLECT_FIELD) | Reflector味方フィールド |
| 28 | Bar (SH_BAR) | HPバー (背景+前景) |

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
