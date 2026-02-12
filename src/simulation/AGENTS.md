# Simulation AGENTS.md

> ゲームロジック・AI・戦闘の変更ガイド。略称・ユニット一覧は CLAUDE.md 参照。

## ファイル責務マップ

| ファイル | 責務 | 変更頻度 |
|----------|------|----------|
| `update.ts` | メインtick: hash構築→ユニット更新→弾→パーティクル→勝利判定 | 中 |
| `combat.ts` | 9攻撃パターン分岐（最大ファイル） | 高 |
| `steering.ts` | Boids + ターゲットAI + 小惑星回避 | 中 |
| `spatial-hash.ts` | 空間ハッシュ（`bHash`/`gN`/`kb`） | 低 |
| `spawn.ts` | `spU`/`spP`/`spPr`/`addBeam` — プール割当 | 低 |
| `effects.ts` | `explosion`/`trail`/`chainLightning` | 中 |
| `reinforcements.ts` | 増援スポーン（確率分布テーブル） | 低 |
| `init.ts` | ゲーム開始時のユニット配置 + 小惑星生成 | 低 |

テスト: `spatial-hash.test.ts`, `spawn.test.ts`（`vitest run`で実行）

## Tick Order（update.ts内）

```
1. bHash()                — 空間ハッシュ再構築
2. per unit:
   a. shielded = false    — リセット
   b. steer(u, dt)        — 移動AI
   c. combat(u, i, dt, now) — 攻撃処理
   d. trail tick          — トレイル生成
3. Reflector pass         — シールド付与（2周目）
4. Projectile pass        — 移動 + homing + ユニット衝突 + 小惑星衝突
5. Particle pass          — 移動 + 寿命管理
6. Beam pass              — 寿命管理（splice）
--- steps 1-6 は常時実行（catalogOpen時も） ---
7. Base damage            — mode=2のみ、80px内のユニットがダメージ
8. Asteroid rotation
9. reinforce(dt)          — 2.5秒ごと
10. Win checks            — mode=1: 全滅、mode=2: 基地HP=0
--- steps 7-10 は !catalogOpen 時のみ ---
[catalogOpen時: steps 7-10スキップ → updateCatDemo(dt)を実行]
```

**重要**: Reflectorのシールド付与（step 3）はsteer/combat（step 2）の後。つまり今フレームのshieldedフラグは次フレームのcombatで有効になる。

### Projectile衝突順序（step 4の詳細）

1. homing更新 → 移動
2. ユニットとの衝突判定（空間ハッシュ使用、味方除外・shielded減衰あり）
3. **小惑星との衝突** — ユニットに未命中時のみ。`catalogOpen`時はスキップ。弾は消滅しパーティクル生成

## Combat分岐フロー（combat.ts）

排他パターン（`return`あり）: `rams` → `reflects` → `emp` → `chain` → `beam`（※spawns除く）
非排他: `heals`, `spawns`, `teleports` — 他パターンと共存可能
最後: NORMAL FIRE — `homing` / `aoe` / `sh===3`(5-burst) / `sh===8`(railgun) / default

### ターゲット alive チェックパターン
beam系・通常攻撃ともに `u.tgt >= 0` でターゲット保持を確認後、`uP[u.tgt]!.alive` で生存判定。死亡時は `u.tgt = -1` でリセットし、次フレームの `steer()` で再取得させる。beam系では `beamOn` のフェードアウト（`-dt*3`）も同時に行う。

## 変更ガイド

### 新攻撃パターン追加
1. `types.ts` — `UnitType`に新フラグ追加（例: `drains?: boolean`）
2. `unit-types.ts` — 該当エントリにフラグ追加
3. `combat.ts` — NORMAL FIREの前に`if (t.newFlag)`分岐挿入
4. `spawn.ts` — 新Unitプロパティがあれば`spU()`の初期化に追加
5. return要否を判断: 排他パターンならreturn、他と共存するならreturnなし

### steering変更
- `steer()` の力の合成: `fx/fy` に各力を加算 → 最後に角速度`u.ang`に反映
- **stun**: `u.stun > 0` → vx/vy *= 0.93、移動のみ実行し全steering力スキップ。stun -= dt
- Boids3要素: Separation（`sx/sy`）、Alignment（`ax/ay`、同type味方）、Cohesion（`chx/chy`、味方全般）
- ターゲット選択: 近傍 → 失敗時1.2%で全域スキャン → なければ`wn`ワンダリング
- 距離による行動: 遠い(`>0.7×rng`)=接近、近い(`<0.3×rng`)=離脱、中間=側面旋回
- **Healer**: 近傍で最も`mass`が大きい味方に向かう力を追加
- **境界力**: `WORLD*0.8`を超えるとfx/fy += 120で押し戻し
- **小惑星衝突**: penetration resolution + velocity impulse（`dx/d * 50`）
- **vet速度**: `spd * (1 + u.vet * 0.12)`

### 増援確率の変更
- `reinforcements.ts` の確率テーブルは単一乱数`r`の範囲で判定
- 範囲は意図的に重複（1waveで複数タイプスポーン可能）
- 低ユニット数ゲート（`cnt<50`/`cnt<40`）: 負けているチームのみ強力ユニット出現
- mode=1は増援なし。mode=2は上限100、mode=0は上限130

#### 増援確率テーブル（実値）

毎wave: Drone×5 + Fighter×2 は確定。加えて単一乱数 `r∈[0,1)` で以下を判定（複数条件が同時成立し、1waveで複数タイプがスポーンする）:

| ユニット | 条件 | 確率 |
|----------|------|------|
| Bomber | `r<0.5` | 50% |
| Cruiser | `r<0.4` | 40% |
| Flagship | `cnt<50 && r<0.1` | 10%（劣勢時のみ） |
| Healer | `0.2≤r<0.35` | 15% |
| Reflector | `0.35≤r<0.5` | 15% |
| Carrier | `cnt<40 && r<0.18` | 18%（劣勢時のみ） |
| Sniper | `0.5≤r<0.65` | 15% |
| Ram | `0.65≤r<0.77` | 12% |
| Missile | `0.3≤r<0.45` | 15% |
| EMP | `0.77≤r<0.87` | 10% |
| Beam Frig. | `0.12≤r<0.25` | 13% |
| Teleporter | `0.87≤r<0.95` | 8% |
| Chain Bolt | `r≥0.95` | 5% |

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
| Reflector判定が名前文字列 | `TYPES[u.type]!.nm !== 'Reflector'` — 名前変更で壊れる |
| beamOn ramp-up/down | 上昇: `+dt*2`（0.5s）、下降: `-dt*3`（0.33s）。幅: `(sz≥15 ? 6 : 4) * beamOn` |

