# AGENTS.md — COSMARIUM

> AI向けナビゲーションガイド。CLAUDE.mdの構造・略称・メカニクス情報を前提とし、**変更作業時の判断指針**を補完する。

## Quick Reference

- **言語**: 日本語で返答
- **型チェック**: `bun run typecheck` (`tsc --noEmit`) — strict mode、`noUnusedLocals`/`noUnusedParameters` off
- **ビルド**: `bun run build` — dist/へ出力
- **全チェック**: `bun run check` — typecheck + lint + format:check + knip + cpd を一括実行
- **未使用export検出**: `bun run knip` — 未使用export/依存を検出
- **コピペ検出**: `bun run cpd` (`jscpd src/`) — コード重複を検出
- **テスト**: なし（手動確認のみ）
- **リンター**: ESLint（flat config）— `no-var: off`, `prefer-const: off`。`src/shaders/**`は除外。`eslint-config-prettier`で競合ルール無効化
- **フォーマッター**: Prettier — singleQuote, printWidth=120。GLSLは除外（`.prettierignore`）
- **Pre-commit**: `simple-git-hooks` + `lint-staged`（`bunx lint-staged`）。ESLintは`--max-warnings=0`で警告もブロック
- **CI**: GitHub Actions（`.github/workflows/ci.yml`）— Bun環境（`oven-sh/setup-bun@v2`）でtypecheck + lint + format:check + knip + cpd
- **Import規約**: 相対パス + `.ts`拡張子明示（`allowImportingTsExtensions: true`）。パスエイリアスなし。barrel export（index.ts）なし

## Dependency Graph (変更影響マップ)

```
types.ts     ← 全ファイルが依存（型定義の変更は全体に波及）
constants.ts ← pools.ts, simulation/*, renderer/*, ui/catalog.ts, ui/hud.ts
state.ts     ← main.ts, simulation/*, renderer/render-pass.ts, renderer/render-scene.ts,
               renderer/minimap.ts, input/camera.ts, ui/*
pools.ts     ← simulation/*, renderer/render-scene.ts, renderer/minimap.ts, ui/catalog.ts, ui/hud.ts
colors.ts    ← simulation/combat.ts, simulation/effects.ts, renderer/render-scene.ts,
               renderer/minimap.ts, ui/catalog.ts
unit-types.ts ← simulation/*, renderer/render-scene.ts, renderer/minimap.ts, ui/catalog.ts

main.ts → renderer/*, simulation/update.ts, input/camera.ts, ui/*
         （初期化順序: initWebGL → initShaders → mkFBOs → initBuffers → initUI → initCamera → initMinimap）
```

## Data Flow（フレーム単位）

```
main loop (main.ts)
  ├─ update(dt, now)                    ← simulation/update.ts
  │   ├─ bHash()                        ← 空間ハッシュ再構築
  │   ├─ per unit: steer() → combat()   ← AI + 攻撃
  │   ├─ reflector pass                 ← シールド付与（次フレームで有効）
  │   ├─ projectile/particle/beam pass  ← 移動 + 衝突 + 寿命
  │   └─ reinforce() + win checks
  └─ renderFrame(now)                   ← renderer/render-pass.ts
      ├─ renderScene(now)               ← pools → iD[] (Float32Array) 書込み
      ├─ gl.bufferData(iD.subarray)     ← GPU upload
      ├─ drawArraysInstanced            ← scene FBO
      ├─ bloom H/V pass                 ← 半解像度FBO
      └─ composite + drawMinimap()      ← 最終出力
```

## ファイル変更ガイド

### 新ユニット追加
1. `unit-types.ts` — `TYPES[]`に定義追加（既存15エントリのフォーマットに従う）
2. `types.ts` — 新フラグが必要なら`Unit`インターフェースに追加
3. `colors.ts` — `TC[]`と`TrC[]`に色ペア追加（index=ユニットtype番号）
4. `simulation/combat.ts` — 新攻撃パターンの分岐を`combat()`に追加（排他なら`return`、非排他ならreturnなし）
5. `simulation/steering.ts` — 特殊移動ロジックがあれば`steer()`に追加
6. `simulation/spawn.ts` — 新プロパティがあれば`spU()`の初期化に追加
7. `ui/catalog.ts` — カタログデモに対応シナリオ追加（`setupCatDemo()`）
8. `src/shaders/main.frag.glsl` — 新シェイプが必要ならSDF追加（次の空きID使用）→ `src/shaders/AGENTS.md` 参照

### 新パーティクルエフェクト追加
1. `simulation/effects.ts` — エフェクト関数を追加（`spP()`でパーティクル生成）
2. 呼び出し元（`combat.ts`や`update.ts`）からインポート

### レンダリング変更
→ `src/renderer/AGENTS.md` 参照

### シミュレーション変更
→ `src/simulation/AGENTS.md` 参照

### シェーダ変更
→ `src/shaders/AGENTS.md` 参照

## State管理パターン

```typescript
// state.ts の var + setter パターン（ESM制約による）
export var gameState: GameState = 'menu';
export function setGameState(v: GameState) { gameState = v; }

// 使用側
import { gameState, setGameState } from './state';
if (gameState === 'play') { ... }
setGameState('win'); // ✅ setter経由
// gameState = 'win'; // ❌ ESM再エクスポートでは代入不可

// poolCounts はオブジェクトなのでプロパティ直接変更可
poolCounts.uC++;  // ✅ OK（オブジェクトプロパティの変更はESMで許可される）
```

## プールパターン（spawn/kill）

```typescript
// 生成: 最初の dead スロットを線形スキャン
function spU(team, type, x, y, ...): number {
  for (let i = 0; i < PU; i++) {
    if (!uP[i].alive) { /* 初期化して return i */ }
  }
  return -1; // プール満杯
}

// 破棄: alive=false + カウンタデクリメント
function killU(i: number) { uP[i].alive = false; poolCounts.uC--; }
```

新オブジェクト種追加時: `pools.ts`にプール配列+カウンタ追加、`constants.ts`に上限定数追加。

## UI・Input概要

| ファイル | 責務 | 備考 |
|----------|------|------|
| `ui/game-control.ts` | メニュー、ゲーム開始/終了、速度、キーショートカット(Tab/Esc/+/-) | `startGame()` → `setGameState('play')` + `initUnits()` |
| `ui/catalog.ts` | ユニットカタログDOM構築、デモ用spawn/update | `setupCatDemo()`が`spU()`経由でプールを消費 |
| `ui/hud.ts` | HUD数値更新（ユニット数/fps/base HP） | DOM直接更新。`gameState==='play'`時のみ |
| `input/camera.ts` | カメラ(pan/zoom/shake)、canvas上のマウスイベント | `catalogOpen`時は入力無効化 |

**カタログ注意**: カタログは実際のプールにユニットを`spU()`で生成するため、`PU`上限に影響する。`catalogOpen`時は`update()`内で`updateCatDemo()`に切替わる。

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `let`でstate変数をexportしない | ESMの再エクスポートは読取専用。`var` + setter必須 |
| プール上限変更時は`constants.ts`と`pools.ts`両方 | `PU`定数とプール配列初期化が別ファイル |
| `_nb`バッファは共有（350要素） | `gN()`の戻り値=バッファ内の有効数。コピーせず即使用 |
| `iD`/`mmD`はFloat32Array | `renderScene()`で毎フレーム書き込み。サイズ=`MAX_I*9` |
| シェーダは`vite-plugin-glsl`経由でimport | `import src from '../shaders/x.glsl'`。`#include`展開もplugin側で処理 |
| `poolCounts`オブジェクト内のカウンタ手動管理 | spawn/kill時に必ずインクリメント/デクリメント |
| lint-stagedは`--max-warnings=0` | ESLint警告が残るとコミット失敗 |
| GLSLのGPUコンパイルはランタイム | CIでは検出不可。ブラウザで確認必須 |
| `catalogOpen`は複数層に影響 | simulation(tick切替)、renderer(カメラ切替)、input(操作無効化)に波及 |

## Subdirectory Knowledge

| ディレクトリ | AGENTS.md | 対象 |
|-------------|-----------|------|
| `src/renderer/` | あり | WebGL2パイプライン、FBO、インスタンスバッファ、描画パス |
| `src/simulation/` | あり | ゲームロジック、AI、戦闘、空間ハッシュ |
| `src/shaders/` | あり | GLSLシェーダ群、SDF関数、Shape IDマップ、#includeパターン |
| `src/ui/` | なし | 3ファイル。上記「UI・Input概要」参照 |
| `src/input/` | なし | camera.ts 1ファイルのみ。上記参照 |
