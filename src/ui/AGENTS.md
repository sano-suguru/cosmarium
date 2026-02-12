# UI AGENTS.md

> DOM操作・カタログ・HUDの変更ガイド。State管理パターン・プールパターンはルート AGENTS.md 参照。

## ファイル責務マップ

| ファイル | 責務 | 変更頻度 |
|----------|------|----------|
| `catalog.ts` | カタログUI構築、デモユニットspawn/update、パネル表示 | 高 |
| `game-control.ts` | メニュー、ゲーム開始/終了、速度制御、キーボードショートカット | 中 |
| `hud.ts` | HUD数値更新（ユニット数/fps/基地HP）。DOM直接更新 | 低 |

## キーボードショートカット（game-control.ts + camera.ts）

| キー | 条件 | 動作 |
|------|------|------|
| `Tab` / `Escape` | play中 | カタログ開閉（`toggleCat()`） |
| `-` / `=` | play中 | 速度1段階下げ/上げ（`stepSpd()`） |
| `Space` | play中 & !catalogOpen | カメラリセット（tx=0, ty=0, tz=1） |

## カタログのプール副作用（最重要）

カタログは**プレビュー専用ではない**。`setupCatDemo()` → `spU()` で実際のプールに生ユニットを生成する。

- `toggleCat()` → `setupCatDemo(catSelected)`: 旧デモユニットを`killU()`で破棄後、新シナリオをspawn
- `updateCatDemo(dt)`: 3秒タイマーで敵残数<2なら再spawn。味方は原点に引き寄せ、敵はHP自動回復
- **影響**: `PU`上限を消費。カタログ中もsteps 1-6（steer/combat/projectile/particle/beam）は実行される

### デモシナリオ分岐

`setupCatDemo()` は`TYPES[typeIdx]`のフラグで分岐:
- `heals` → 味方2体（低HP）+ 敵3体
- `reflects` → 敵5体（Fighterがメインユニットをターゲット）
- `spawns` → 敵4体
- `emp` → 敵8体（円形配置）
- `chain` → 敵6体（ジグザグ配置）
- `teleports` → 敵4体
- `rams` → 敵Cruiser×3、メインユニットを左寄せ
- default → sh依存で敵2〜6体

## 変更ガイド

### 新ユニットのカタログデモ追加
1. `catalog.ts` — `setupCatDemo()` に新フラグの `else if` 分岐追加
2. 敵の配置（数・位置・type）はユニット特性が映えるように設計

### 速度プリセット変更
- `game-control.ts` — `speeds` 配列: `[0.2, 0.4, 0.55, 0.75, 1, 1.5, 2.5]`
- `+`/`-` キーは`stepSpd()`で配列内を1段階移動
- `.sbtn`ボタンの`data-spd`属性と一致させる必要あり（HTMLとJS両方）

### HUD項目追加
1. `hud.ts` — `updateHUD()` に `document.getElementById('新ID')!.textContent = ...` 追加
2. `index.html` に対応するDOM要素追加
3. `gameMode` 条件分岐の要否を確認（基地HPはmode=2のみ表示）

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| カタログがプールを消費 | `spU()`で実ユニット生成。`PU`上限に影響。`killU()`での破棄漏れ注意 |
| `setupCatDemo()`冒頭で全particle/projectile/beam消去 | カタログ切替時にパーティクルが全消滅するのは仕様 |
| DOM要素IDはハードコード | `getElementById('cpName')!`等。HTML側のID変更で即壊れる |
| `showWin()`は`game-control.ts` | カタログではなくgame-control側にある。勝利画面変更時は注意 |
| `updateHUD`は毎フレームgetElementById | DOMノードキャッシュなし。PU全走査(O(800))もあり |
