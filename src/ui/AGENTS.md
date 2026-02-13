# UI AGENTS.md

> DOM操作・カタログ・HUDの変更ガイド。

## カタログのプール副作用（最重要）

カタログは**プレビュー専用ではない**。`setupCatDemo()` → `spawnUnit()`で実際のプールに生ユニットを生成する。`POOL_UNITS`上限を消費。steps 1-6(steer/combat等)はカタログ中も実行される。閉じ時は`teardownCatDemo()`で自動片付け。切替時に全particle/projectile/beam消去は仕様。

## 変更ガイド

### 新ユニットのカタログデモ追加
`catalog.ts`の`setupCatDemo()`に新フラグの`else if`分岐追加。敵配置はユニット特性が映える構成にする。分岐キーは`TYPES[typeIdx]`のフラグ。

### HUD項目追加
`ui/dom-ids.ts`(ID定数) → `ui/hud.ts`(`initHUD`でキャッシュ+`updateHUD`で更新) → `index.html`(DOM要素)。`gameMode`条件分岐の要否を確認。

### 速度プリセット変更
`game-control.ts`の`speeds`配列と`.sbtn`の`data-spd`属性を一致させる。

## Critical Gotchas

- `setupCatDemo()`は`spawnUnit()`で実ユニット生成 → プール上限に影響
- DOM要素IDは`dom-ids.ts`で定数化済み。新規追加時はここに追加
- `showWin()`は`game-control.ts`にある（catalogではない）
- `updateHUD`は毎フレームO(`POOL_UNITS`)でプール走査。DOMノードは`initHUD()`でキャッシュ済み
