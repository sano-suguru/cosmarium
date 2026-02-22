# UI AGENTS.md

> DOM操作・Codex・HUDの変更ガイド。

## アーキテクチャ

DOM + CSS でHUD/メニュー/Codexパネルを構成。WebGL Canvasとは分離。Codexデモのみ simulation の `spawnUnit()` で実ユニットを生成し Canvas 上に描画。

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| codex.ts | Codex DOM構築 + デモ生成/更新/破棄 + snapshot/restore。最大ファイル |
| game-control.ts | initUI: メニュー/ボタン/キーボード(Tab/Esc/速度)。codex toggle |
| dev-overlay.ts | 開発用警告オーバーレイ(devWarn/devError) |
| hud.ts | initHUD + updateHUD(毎フレーム)。プール走査でカウント表示 |
| dom-ids.ts | DOM ID定数。新UI要素追加時はここにID追加 |

テスト: `codex-camera.test.ts` — Codexデモ時のカメラ挙動検証。

## Codexのプール副作用（最重要）

Codexは**プレビュー専用ではない**。`setupCodexDemo()` → `spawnUnit()`で実際のプールに生ユニットを生成する。

**snapshot/restore方式**: `toggleCodex()` → `snapshotPools()`で全プール状態を保存 → `clearAllPools()`でプールを空にし → デモ専用ユニットを生成。閉じ時は`restorePools(snapshot)`で元の状態に完全復元。

- `snapshotPools()`: 全aliveエンティティのshallow copy + beams/trackingBeams + poolCountsを保存
- `clearAllPools()`: 全スロット`.alive=false` + カウントリセット + beams/trackingBeams/pendingChains消去
- `restorePools(snapshot)`: clearAllPools → snapshot内容をObject.assignで書き戻し + setPoolCountsでカウント復元

## 変更ガイド

### 新ユニットのCodexデモ追加
`codex.ts`の`demoByFlag`レコードに新デモ関数を追加。`demoFlag()`がユニットのフラグから代表フラグを選定し、対応するデモを起動する。敵配置はユニット特性が映える構成にする。

### HUD項目追加
`ui/dom-ids.ts`(ID定数) → `ui/hud.ts`(`initHUD`でキャッシュ+`updateHUD`で更新) → `index.html`(DOM要素)。

### 速度プリセット変更
`game-control.ts`の`speeds`配列と`.sbtn`の`data-spd`属性を一致させる。

## 入力イベント登録箇所

| イベント | ファイル | 備考 |
|---------|---------|------|
| wheel/mousedown/mousemove/mouseup | input/camera.ts | codexOpen時は無効化 |
| keydown(Space) | input/camera.ts | カメラリセット |
| keydown(Tab/Esc) | game-control.ts | codex toggle |
| keydown(±/1-3) | game-control.ts | 速度変更 |
| click(ボタン) | game-control.ts | メニュー操作 |

## Critical Gotchas

- DOM要素IDは`dom-ids.ts`で定数化済み。新規追加時はここに追加
- `updateHUD`は毎フレームO(`POOL_UNITS`)でプール走査。DOMノードは`initHUD()`でキャッシュ済み
- `codex.ts` → `game-control.ts` の逆方向importは循環依存になるため禁止（game-control.ts にNOTEコメントあり）
- タッチ入力（touchstart/pointer*）は未実装。現在はマウス+キーボードのみ
- Codexデモ中のRNG: main.tsが`demoRng`（`Math.random`ベース）を注入。意図的に非決定論的
