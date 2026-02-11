# Simulation AGENTS.md

> ゲームロジック・AI・戦闘の変更ガイド。略称・ユニット一覧は CLAUDE.md 参照。

## ファイル責務マップ

| ファイル | 責務 | 変更頻度 |
|----------|------|----------|
| `update.ts` | メインtick: hash構築→ユニット更新→弾→パーティクル→勝利判定 | 中 |
| `combat.ts` | 9攻撃パターン分岐（最大ファイル 260行） | 高 |
| `steering.ts` | Boids + ターゲットAI + 小惑星回避 | 中 |
| `spatial-hash.ts` | 空間ハッシュ（`bHash`/`gN`/`kb`） | 低 |
| `spawn.ts` | `spU`/`spP`/`spPr`/`addBeam` — プール割当 | 低 |
| `effects.ts` | `explosion`/`trail`/`chainLightning` | 中 |
| `reinforcements.ts` | 増援スポーン（確率分布テーブル） | 低 |
| `init.ts` | ゲーム開始時のユニット配置 + 小惑星生成 | 低 |

## Tick Order（update.ts内）

```
1. bHash()                — 空間ハッシュ再構築
2. per unit:
   a. shielded = false    — リセット
   b. steer(u, dt)        — 移動AI
   c. combat(u, i, dt, now) — 攻撃処理
   d. trail tick          — トレイル生成
3. Reflector pass         — シールド付与（2周目）
4. Projectile pass        — 移動 + homing + 衝突判定 + AOE爆発
5. Particle pass          — 移動 + 寿命管理
6. Beam pass              — 寿命管理（splice）
7. Base damage            — mode=2のみ、80px内のユニットがダメージ
8. Asteroid rotation
9. reinforce(dt)          — 2.5秒ごと
10. Win checks            — mode=1: 全滅、mode=2: 基地HP=0
```

**重要**: Reflectorのシールド付与（step 3）はsteer/combat（step 2）の後。つまり今フレームのshieldedフラグは次フレームのcombatで有効になる。

## Combat分岐フロー（combat.ts）

排他パターン（`return`あり）: `rams` → `reflects` → `emp` → `chain` → `beam`（※spawns除く）
非排他: `heals`, `spawns`, `teleports` — 他パターンと共存可能
最後: NORMAL FIRE — `homing` / `aoe` / `sh===3`(5-burst) / `sh===8`(railgun) / default

## 変更ガイド

### 新攻撃パターン追加
1. `types.ts` — `UnitType`に新フラグ追加（例: `drains?: boolean`）
2. `unit-types.ts` — 該当エントリにフラグ追加
3. `combat.ts` — NORMAL FIREの前に`if (t.newFlag)`分岐挿入
4. `spawn.ts` — 新Unitプロパティがあれば`spU()`の初期化に追加
5. return要否を判断: 排他パターンならreturn、他と共存するならreturnなし

### steering変更
- `steer()` の力の合成: `fx/fy` に各力を加算 → 最後に角速度`u.ang`に反映
- Boids3要素: Separation（`sx/sy`）、Alignment（`ax/ay`、同type味方）、Cohesion（`chx/chy`、味方全般）
- ターゲット選択: 近傍 → 失敗時1.2%で全域スキャン → なければ`wn`ワンダリング
- 距離による行動: 遠い(`>0.7×rng`)=接近、近い(`<0.3×rng`)=離脱、中間=側面旋回

### 増援確率の変更
- `reinforcements.ts` の確率テーブルは単一乱数`r`の範囲で判定
- 範囲は意図的に重複（1waveで複数タイプスポーン可能）
- 低ユニット数ゲート（`cnt<50`/`cnt<40`）: 負けているチームのみ強力ユニット出現

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `dt`は0.033でクランプ | `update()`冒頭。大きすぎるdtで物理が壊れるのを防止 |
| `killU()`はindexで呼ぶ | `killU(oi)` — Unit参照ではなくプール配列index |
| `u.tgt`はプールindex | -1=ターゲットなし。ターゲットの`.alive`を必ずチェック |
| beamsは`.splice()`で削除 | プールではなく動的配列。逆順ループ必須 |
| `explosion()`のkiller引数 | -1=キラー不明。有効indexならvet/killsを加算 |
| combat内の`vd` | `1 + u.vet * 0.2` — ダメージ乗算。vet変更時は確認 |
| `gN()`は`bHash()`後のみ有効 | フレーム冒頭で再構築。途中でユニット追加しても反映されない |
