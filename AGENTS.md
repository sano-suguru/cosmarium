# AGENTS.md — COSMARIUM

> 変更作業時の判断指針。数値の正は常にソースコード。

## Quick Reference

- **言語**: 日本語で返答
- **型チェック**: `bun run typecheck` — strict mode、`noUnusedLocals`/`noUnusedParameters` on
- **ビルド**: `bun run build`
- **全チェック**: `bun run check` — typecheck + lint + format:check + knip + cpd
- **テスト**: `bun run test:run` — `src/simulation/*.test.ts`(7) + `src/*.test.ts`(4)。ヘルパー: `src/__test__/pool-helper.ts`
- **Lint/Format**: Biome。`src/shaders/**`は除外。singleQuote, lineWidth=120
- **Pre-commit**: `biome check --staged --write`。エラーのみブロック
- **Import規約**: 相対パス + `.ts`拡張子明示。パスエイリアスなし。barrel export なし
- **TSC strict（コーディングに影響）**: `verbatimModuleSyntax`(型importは`import type`必須)、`exactOptionalPropertyTypes`(`undefined`直接代入不可)、`noUncheckedIndexedAccess`(配列indexは`T | undefined`)、`noImplicitReturns`

## Game Modes

3モード: Infinite(0)/Annihilation(1)/Base Assault(2)。詳細は`state.ts`の`GameMode`型と`simulation/update.ts`の勝利判定参照。

## 主要モジュールと変更影響

`types.ts`は全ファイルが依存（変更は全体に波及）。`constants.ts`/`state.ts`/`pools.ts`/`colors.ts`/`unit-types.ts`も広域依存。定数値は`src/constants.ts`参照。

## Data Flow概要

- main loop: `gameState==='play'`時のみ実行
- dt二重クランプ: main.ts(0.05s) → update.ts(0.033s)
- update順: `buildHash()` → per unit(`steer`→`combat`) → reflector pass → projectile pass → particle/beam pass → `!catalogOpen`時のみ(base damage/reinforce/win check)
- `catalogOpen`時: steps 7-10スキップ → `updateCatDemo(dt)`実行。renderer: カメラ→原点z=2.5固定。input: 操作無効化

## ファイル変更ガイド

### 新ユニット追加
`unit-types.ts` → `types.ts`(新フラグ時) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts`(特殊移動時) → `simulation/spawn.ts`(新プロパティ時) → `ui/catalog.ts` → `src/shaders/main.frag.glsl`(新シェイプ時)

### 新エフェクト追加
`simulation/effects.ts` にエフェクト関数追加 → 呼び出し元からインポート

### 他の変更
レンダリング→`src/renderer/AGENTS.md`、シミュレーション→`src/simulation/AGENTS.md`、シェーダ→`src/shaders/AGENTS.md`、UI→`src/ui/AGENTS.md`

## 規約

- **state.ts**: 単一exportオブジェクト。プロパティ変更はOK
- **poolCounts**: Readonly export。外部から直接変更は型エラー。`killUnit`/`killParticle`/`killProjectile`集約関数経由で操作
- **spawn/kill**: プール先頭からdead slot線形スキャン。全kill関数に二重kill防止ガードあり。inline で poolCounts を直接操作しない
- **新オブジェクト種追加時**: `pools.ts`にプール配列+カウンタ追加、`constants.ts`に上限定数追加

## テストパターン

vitest + Node環境。ヘルパー`src/__test__/pool-helper.ts`(`resetPools()`/`resetState()`/`spawnAt()`)を必ず使用。`afterEach`で`resetPools()` + `resetState()` + `vi.restoreAllMocks()`。`vi.mock()`でUI/camera依存を排除。

## Critical Gotchas

- `neighborBuffer`は共有バッファ: `getNeighbors()`が書込み、戻り値=有効数。コピーせず即使用
- `catalogOpen`は simulation/renderer/input/main の4層に波及（上記Data Flow参照）
- `bases`は`[Base, Base]`タプル: `0`/`1`または`Team`型indexなら`!`不要
- GLSLのGPUコンパイルはランタイムのみ。CIでは検出不可
- シェーダは`vite-plugin-glsl`経由でimport。`#include`展開もplugin側で処理
