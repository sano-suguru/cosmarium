# UI AGENTS.md

> DOM操作・Codex・HUDの変更ガイド。

## アーキテクチャ

DOM + CSS でHUD/メニュー/Codexパネルを構成。WebGL Canvasとは分離。Codexデモのみ simulation の `spawnUnit()` で実ユニットを生成し Canvas 上に描画。

## ファイル一覧

| ファイル | 行数 | 役割 |
|---------|------|------|
| game-control.ts | 174 | initUI: メニュー/ボタン/キーボード(Tab/Esc/速度)。codex toggle |
| codex.ts | 373 | Codex DOM構築 + デモ生成/更新/破棄。最大ファイル |
| hud.ts | 55 | initHUD + updateHUD(毎フレーム)。プール走査でカウント表示 |
| dom-ids.ts | 22 | DOM ID定数。新UI要素追加時はここにID追加 |
| dev-overlay.ts | 75 | 開発用警告オーバーレイ(devWarn/devError) |

## Codexのプール副作用（最重要）

Codexは**プレビュー専用ではない**。`setupCodexDemo()` → `spawnUnit()`で実際のプールに生ユニットを生成する。`POOL_UNITS`上限を消費。`codexOpen`時、非デモユニットのsteer/combatはスキップされる（`isCodexDemoUnit()`で判定）。閉じ時は`teardownCodexDemo()`で自動片付け。切替時に全particle/projectile/beam消去は仕様。

## 変更ガイド

### 新ユニットのCodexデモ追加
`codex.ts`の`setupCodexDemo()`に新フラグの`else if`分岐追加。敵配置はユニット特性が映える構成にする。分岐キーは`TYPES[typeIdx]`のフラグ。

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

- `setupCodexDemo()`は`spawnUnit()`で実ユニット生成 → プール上限に影響
- DOM要素IDは`dom-ids.ts`で定数化済み。新規追加時はここに追加
- `updateHUD`は毎フレームO(`POOL_UNITS`)でプール走査。DOMノードは`initHUD()`でキャッシュ済み
- `codex.ts` → `game-control.ts` の逆方向importは循環依存になるため禁止（game-control.ts にNOTEコメントあり）
- タッチ入力（touchstart/pointer*）は未実装。現在はマウス+キーボードのみ
