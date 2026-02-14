# UI AGENTS.md

> DOM操作・Codex・HUDの変更ガイド。

## Codexのプール副作用（最重要）

Codexは**プレビュー専用ではない**。`setupCodexDemo()` → `spawnUnit()`で実際のプールに生ユニットを生成する。`POOL_UNITS`上限を消費。`codexOpen`時、非デモユニットのsteer/combatはスキップされる（`isCodexDemoUnit()`で判定）。閉じ時は`teardownCodexDemo()`で自動片付け。切替時に全particle/projectile/beam消去は仕様。

## 変更ガイド

### 新ユニットのCodexデモ追加
`codex.ts`の`setupCodexDemo()`に新フラグの`else if`分岐追加。敵配置はユニット特性が映える構成にする。分岐キーは`TYPES[typeIdx]`のフラグ。

### HUD項目追加
`ui/dom-ids.ts`(ID定数) → `ui/hud.ts`(`initHUD`でキャッシュ+`updateHUD`で更新) → `index.html`(DOM要素)。

### 速度プリセット変更
`game-control.ts`の`speeds`配列と`.sbtn`の`data-spd`属性を一致させる。

## Critical Gotchas

- `setupCodexDemo()`は`spawnUnit()`で実ユニット生成 → プール上限に影響
- DOM要素IDは`dom-ids.ts`で定数化済み。新規追加時はここに追加
- `updateHUD`は毎フレームO(`POOL_UNITS`)でプール走査。DOMノードは`initHUD()`でキャッシュ済み
