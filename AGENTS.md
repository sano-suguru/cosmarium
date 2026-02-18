# AGENTS.md — COSMARIUM

> 変更作業時の判断指針。数値の正は常にソースコード。

## Quick Reference

- **言語**: 日本語で返答
- **型チェック**: `bun run typecheck` — strict mode、`noUnusedLocals`/`noUnusedParameters` on
- **ビルド**: `bun run build`
- **全チェック**: `bun run check` — typecheck + lint + format:check + knip + cpd + similarity + test
- **テスト**: `bun run test:run` — `src/simulation/*.test.ts`(7) + `src/*.test.ts`(4)。ヘルパー: `src/__test__/pool-helper.ts`
- **Lint/Format**: Biome。`src/shaders/**`は除外。singleQuote, lineWidth=120
- **Pre-commit**: `biome check --staged --write`。エラーのみブロック
- **Import規約**: 相対パス + `.ts`拡張子明示。パスエイリアスなし。barrel export なし
- **TSC strict（コーディングに影響）**: `verbatimModuleSyntax`(型importは`import type`必須)、`exactOptionalPropertyTypes`(`undefined`直接代入不可)、`noUncheckedIndexedAccess`(配列indexは`T | undefined`)、`noImplicitReturns`

## Game Mode

Infinite モードのみ。永続的な宇宙戦争シミュレーション。

## 主要モジュールと変更影響

`types.ts`は全ファイルが依存（変更は全体に波及）。`constants.ts`/`state.ts`/`pools.ts`/`colors.ts`/`unit-types.ts`も広域依存。定数値は`src/constants.ts`参照。

## Data Flow概要

- main loop: `gameState==='play'`時のみ実行
- dt二重クランプ: main.ts(0.05s) → update.ts(0.033s)
- update順: `buildHash()` → per unit(`steer`→`combat`、`codexOpen`時は非デモユニットスキップ) → reflector pass → projectile pass → particle/beam pass → `!codexOpen`時のみ `reinforce(dt)`
- `update(rawDt, now, rng, gameState)`: `rng`は`state.ts`のclosureラッパー、`gameState`は`{ codexOpen, reinforcementTimer }`（`GameLoopState`）
- `codexOpen`時: 非デモユニットのsteer/combatスキップ + reinforce スキップ → `updateCodexDemo(dt)`実行。renderer: カメラ→原点z=2.5固定。input: 操作無効化。メニューからもアクセス可能

## ファイル変更ガイド

### 新ユニット追加
`unit-types.ts` → `types.ts`(新フラグ時) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts`(特殊移動時) → `simulation/spawn.ts`(新プロパティ時) → `ui/codex.ts` → `src/shaders/main.frag.glsl`(新シェイプ時)

### 新エフェクト追加
`simulation/effects.ts` にエフェクト関数追加 → 呼び出し元からインポート

### 他の変更
レンダリング→`src/renderer/AGENTS.md`、シミュレーション→`src/simulation/AGENTS.md`、シェーダ→`src/shaders/AGENTS.md`、UI→`src/ui/AGENTS.md`

## 規約

- **state.ts**: 単一exportオブジェクト。プロパティ変更はOK
- **poolCounts**: Readonly export。外部から直接変更は型エラー。`killUnit`/`killParticle`/`killProjectile`集約関数経由で操作
- **spawn/kill**: プール先頭からdead slot線形スキャン。全kill関数に二重kill防止ガードあり
  - Don't inline で poolCounts を直接操作する — 必ず集約関数経由
- **新オブジェクト種追加時**: `pools.ts`にプール配列+カウンタ追加、`constants.ts`に上限定数追加

## テストパターン

vitest + Node環境。ヘルパー`src/__test__/pool-helper.ts`(`resetPools()`/`resetState()`/`spawnAt()`)を必ず使用。`afterEach`で`resetPools()` + `resetState()` + `vi.restoreAllMocks()`。`vi.mock()`でUI/camera依存を排除。

## 作業方針

### 調査と実装を分離する

調査（ファイル読み、依存関係の把握）と実装は別フェーズ。調査をサブタスクに委譲した場合、結果が返るまで同じ調査を自分で始めない。

### 計画が必要なタスク

以下に該当する場合、実装前に作業を分割する:

| 条件 | 理由 |
|------|------|
| 3モジュール以上にまたがる変更 | 上記「ファイル変更ガイド」の依存チェーン参照 |
| `types.ts`または`state.ts`の変更 | 全ファイルに波及 |
| 新ユニット追加 | 6〜8ファイルの連鎖変更が必要 |
| シェーダ変更 | 型安全性なし。ブラウザ実行でしか検証不可 |

### 分割単位の目安

- 型定義の追加 → `bun run typecheck`で検証 → 次へ
- ロジック変更 → `bun run test:run`で検証 → 次へ
- シェーダ変更 → ブラウザで目視確認 → 次へ

各単位で`bun run typecheck`が通る状態を維持する。

### Don't

- 調査を委譲した後、結果を待たずに同じ調査を自分で行う
- 全ファイルを読んでから実装を始める（必要な箇所だけ読む）
- 複数モジュールを一度に変更して最後にまとめて検証する

## Critical Gotchas

- `neighborBuffer`は共有バッファ: `getNeighbors()`が書込み、戻り値=有効数。コピーせず即使用
- `codexOpen`は simulation/renderer/input/main の4層に波及（上記Data Flow参照）
- GLSLのGPUコンパイルはランタイムのみ。CIでは検出不可
- シェーダは`vite-plugin-glsl`経由でimport。`#include`展開もplugin側で処理
