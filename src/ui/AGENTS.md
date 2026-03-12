# UI AGENTS.md

> Preact コンポーネント + CSS Modules による UI 層の変更ガイド。

## アーキテクチャ

Preact 関数コンポーネント + Preact Signals + CSS Modules でUI層を構成。WebGL Canvas とは分離。Codex デモのみ simulation の `spawnUnit()` で実ユニットを生成し Canvas 上に描画。

レイヤー分離: UI 層は Preact エコシステムを採用。シミュレーション/レンダリング層はクラスなし・手続き的・依存ゼロ。

## ファイル一覧

### コンポーネント（TSX + CSS Modules）

| ファイル | 役割 |
|---------|------|
| `App.tsx` | ルートコンポーネント。Signal ベースの条件分岐で画面切り替え |
| `menu/Menu.tsx` + `.module.css` | メインメニュー (START/SPECTATE/MELEE/CODEX) |
| `hud/Hud.tsx` + `.module.css` | 戦闘HUD: ユニット数・HP バー・FPS・ラウンド情報 |
| `fleet-compose/FleetCompose.tsx` + `.module.css` | 艦隊編成画面 |
| `codex/Codex.tsx` + `.module.css` | ユニット図鑑: 性能表示 + 実戦デモ |
| `kill-feed/KillFeed.tsx` + `.module.css` | 撃破通知フィード |
| `play-controls/PlayControls.tsx` + `.module.css` | 速度変更・Codex・Follow ボタン + ヒント |
| `battle-result/BattleResult.tsx` + `.module.css` | 戦闘結果・ランキング表示 |
| `battle-result/MeleeResult.module.css` | Melee 用追加スタイル |
| `shared/RunInfoBar.tsx` | 再利用可能なラウンド/残機/勝利情報バー |
| `shared/button.module.css` | 共通ボタンスタイル (.btn) — Menu, FleetCompose, BattleResult で使用 |
| `dev-overlay/DevOverlay.tsx` + `.module.css` | DEV専用警告/エラーオーバーレイ（本番ビルドで tree-shake） |

### ロジック・ユーティリティ

| ファイル | 役割 |
|---------|------|
| `signals.ts` | Preact Signals: gameState$, codexOpen$, playUiVisible$ 等。state.ts と双方向同期 |
| `game-control.ts` | ゲームフロー制御: 開始/メニュー遷移/キーボード(Tab/Esc/速度) |
| `codex/codex-logic.ts` | Codex コアロジック: プール snapshot/restore |
| `codex-demos.ts` | Codex デモ用ユニット生成 |
| `dom-util.ts` | 型安全な `getElement()` ラッパー |
| `format.ts` | テキストフォーマットヘルパー |
| `battle-result/result-data.ts` | 戦闘結果の型定義 |
| `battle-result/melee-ranking.ts` | Melee ランキング計算 |

### テスト

| ファイル | 対象 |
|---------|------|
| `codex-camera.test.ts` | Codex デモ時のカメラ挙動 |
| `battle-result/melee-ranking.test.ts` | Melee ランキング計算 |

## Codex のプール副作用（最重要）

Codex は**プレビュー専用ではない**。`setupCodexDemo()` → `spawnUnit()` で実際のプールに生ユニットを生成する。

**snapshot/restore 方式**: Codex open → `snapshotPools()` で全プール状態を保存 → `clearAllPools()` でプールを空にし → デモ専用ユニットを生成。閉じ時は `restorePools(snapshot)` で元の状態に完全復元。

- `snapshotPools()`: 全 alive エンティティの shallow copy + beams/trackingBeams + poolCounts を保存
- `clearAllPools()`: 全スロット `.alive=false` + カウントリセット + beams/trackingBeams/pendingChains 消去
- `restorePools(snapshot)`: clearAllPools → snapshot 内容を Object.assign で書き戻し + setPoolCounts でカウント復元

## 変更ガイド

### 新ユニットの Codex デモ追加
`codex-demos.ts` の `demoByFlag` レコードに新デモ関数を追加。`demoFlag()` がユニットのフラグから代表フラグを選定し、対応するデモを起動する。敵配置はユニット特性が映える構成にする。

### HUD 項目追加
`hud/Hud.tsx` にマークアップ追加 → `Hud.module.css` にスタイル追加。Signal が必要なら `signals.ts` に追加。

### 速度プリセット変更
`game-control.ts` の `speeds` 配列を変更 → `play-controls/PlayControls.tsx` のボタン表示を一致させる。

### 新コンポーネント追加
1. `src/ui/<name>/` ディレクトリ作成
2. `<Name>.tsx` + `<Name>.module.css` を作成
3. `App.tsx` で条件付きレンダリング追加
4. 必要に応じて `signals.ts` に Signal 追加

## 入力イベント登録箇所

| イベント | ファイル | 備考 |
|---------|---------|------|
| wheel | input/camera.ts | デスクトップホイールズーム。codexOpen 時は無効化 |
| pointerdown/pointermove/pointerup/pointercancel | input/camera.ts | パン+ピンチズーム。mouse/touch 両対応 |
| keydown(Space) | input/camera.ts | カメラリセット |
| keydown(Tab/Esc) | game-control.ts | Codex toggle |
| keydown(±/1-3) | game-control.ts | 速度変更 |
| pointerdown | renderer/minimap.ts | ミニマップジャンプ。mouse/touch 両対応 |

## Critical Gotchas

- `codex-logic.ts` → `game-control.ts` の逆方向 import は循環依存になるため禁止（dependency-cruiser ルール `no-codex-to-game-control` で強制済み）
- Pointer Events 統一済み（mouse/touch 両対応）。CSS メディアクエリで操作ガイド・レイアウトをタッチデバイス向けに出し分け
- Codex デモ中の RNG: main.ts が `demoRng`（`Math.random` ベース）を注入。意図的に非決定論的
- `style.css` にはグローバルリセット・Canvas・minimap スタイルのみ残存。コンポーネント固有スタイルは CSS Modules に配置
- 共通ボタンスタイルは `shared/button.module.css` の `.btn` クラスを使用
