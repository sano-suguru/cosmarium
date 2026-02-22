# AGENTS.md — COSMARIUM

> 変更作業時の判断指針。数値の正は常にソースコード。Infiniteモード（永続的な宇宙戦争シミュレーション）のみ。

## Quick Reference

- **言語**: 日本語で返答
- **型チェック**: `bun run typecheck` — strict mode、`noUnusedLocals`/`noUnusedParameters` on
- **ビルド**: `bun run build`
- **全チェック**: `bun run check` — typecheck + lint + format:check + knip + cpd + similarity + test + check:deps
- **テスト**: `bun run test:run` — ヘルパー: `src/__test__/pool-helper.ts`
- **Lint/Format**: Biome。`src/shaders/**`は除外。singleQuote, lineWidth=120
- **Biome重要ルール**: `noConsole: error`(error/warnのみ許可)、`noExplicitAny: error`。他は`biome.json`参照
- **Pre-commit**: simple-git-hooks経由。`biome check --staged --write`。エラーのみブロック
- **コード品質**: `bun run similarity` — 類似度検出(閾値0.92、最小7行)。`bun run check:deps` — dependency-cruiser依存ルール検証。`bun run knip` — 未使用export検出。`bun run cpd` — コピペ検出(jscpd)
- **Import規約**: 相対パス + `.ts`拡張子明示。パスエイリアスなし。barrel export なし
- **TSC strict（コーディングに影響）**: `verbatimModuleSyntax`(型importは`import type`必須)、`exactOptionalPropertyTypes`(`undefined`直接代入不可)、`noUncheckedIndexedAccess`(配列indexは`T | undefined`)、`noImplicitReturns`

## 構造

```
src/
├── main.ts              # エントリ + requestAnimationFrame ループ
├── types.ts             # 全型定義（Unit/Particle/Projectile/Beam等）。全ファイルが依存
├── constants.ts         # プール上限、WORLD_SIZE、シェーダ定数
├── state.ts             # ミュータブルgame state + mulberry32 rng closure
├── pools.ts             # オブジェクトプール（unit/particle/projectile）+ poolCounts
├── colors.ts            # チームカラー、トレイルカラーテーブル
├── unit-types.ts        # 15ユニットタイプ定義（UnitType配列）
├── beams.ts             # beam/trackingBeam 動的配列
├── simulation/          # ゲームロジック（詳細: simulation/AGENTS.md）
├── renderer/            # WebGL2レンダリング（詳細: renderer/AGENTS.md）
├── shaders/             # GLSLソース（詳細: shaders/AGENTS.md）
├── ui/                  # Codex/HUD/メニュー（詳細: ui/AGENTS.md）
└── input/camera.ts      # カメラ状態 + マウス/キー入力ハンドリング
```

## 依存ルール（dependency-cruiser）

`.dependency-cruiser.cjs`で強制。違反は`bun run check:deps`でエラー:
- `simulation/` → `state.ts` 禁止。rng/stateは呼び出し元から引数注入
- `simulation/` → `ui/` 禁止。コールバック注入で依存逆転

## 主要モジュールと変更影響

`types.ts`は全ファイルが依存（変更は全体に波及）。`constants.ts`/`state.ts`/`pools.ts`/`colors.ts`/`unit-types.ts`も広域依存。定数値は`src/constants.ts`参照。

## Data Flow概要

詳細は`src/simulation/AGENTS.md`のTick順序を参照。概略:

- main loop: `gameState==='play'`時のみ実行。dtは`Math.min(dt, 0.05)`でクランプ
- update.tsがサブステップ分割（最大`MAX_STEPS_PER_FRAME=8`回）→ 各ステップでhash→steer→combat→effects→reinforce
- `codexOpen`時: simulation/renderer/input/mainの4層に波及。非デモユニットのsteer/combatスキップ、reinforceスキップ、カメラ固定、操作無効化
- RNG: main.tsが`state.rng`(seeded)か`demoRng`を選択し`update()`に引数注入。simulation内は全て引数経由（依存ルール準拠）

## ファイル変更ガイド

### 新ユニット追加
`unit-types.ts` → `types.ts`(新フラグ時) → `colors.ts` → `simulation/combat.ts` → `simulation/steering.ts`(特殊移動時) → `simulation/spawn.ts`(新プロパティ時) → `ui/codex.ts` → `src/shaders/main.frag.glsl`(新シェイプ時)

### 新エフェクト追加
`simulation/effects.ts` にエフェクト関数追加 → 呼び出し元からインポート

### 他の変更
レンダリング→`src/renderer/AGENTS.md`、シミュレーション→`src/simulation/AGENTS.md`、シェーダ→`src/shaders/AGENTS.md`、UI→`src/ui/AGENTS.md`

## 規約

- **state.ts**: 単一exportオブジェクト。プロパティ変更はOK
- **poolCounts**: Readonly export。外部からの直接変更は型エラー。必ず`killUnit`/`killParticle`/`killProjectile`等の集約関数経由で操作
- **spawn/kill**: Unit/Projectileはプール先頭からdead slot線形スキャン。Particleは LIFO free stack（Uint16Array）で高速アロケーション。全kill関数に二重kill防止ガードあり
- **新オブジェクト種追加時**: `pools.ts`にプール配列+カウンタ追加、`constants.ts`に上限定数追加
- **プールアクセサ**: `unit(i)`/`particle(i)`/`projectile(i)`はpools.tsの集約関数経由。noUncheckedIndexedAccessのundefinedチェックを集約

## テストパターン

vitest + Node環境。ヘルパー`src/__test__/pool-helper.ts`(`resetPools()`/`resetState()`/`spawnAt()`/`fillUnitPool()`/`makeGameLoopState()`)を必ず使用。`afterEach`で`resetPools()` + `resetState()` + `vi.restoreAllMocks()`。`vi.mock()`でUI/camera依存を排除。`seedRng(12345)`でRNG決定論性を担保。

## 作業方針

### 調査と実装を分離する

調査（ファイル読み、依存関係の把握）と実装は別フェーズ。調査をサブタスクに委譲した場合、結果が返るまで同じ調査を自分で始めない。全ファイルを読んでから実装を始めるのではなく、必要な箇所だけ読む。

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

各単位で`bun run typecheck`が通る状態を維持する。複数モジュールを一度に変更して最後にまとめて検証しない。

## Critical Gotchas

- Codexの`snapshotPools()`/`restorePools()`はshallow copy。Object.assignで書き戻し
- `1 - team`ではなく `.team !== u.team` で比較する（`1 - team`は`number`型になり`Team`型にならない）
- ブランドindex: プールループでは`i as UnitIndex`（ParticleIndex/ProjectileIndex）にキャスト必要

simulation固有のgotchas（`neighborBuffer`共有バッファ、`killUnit()`前の値退避、`beams`のswap-and-pop等）は`src/simulation/AGENTS.md`参照。シェーダ固有（GLSLランタイムコンパイル、`vite-plugin-glsl`の`#include`展開等）は`src/shaders/AGENTS.md`参照。
