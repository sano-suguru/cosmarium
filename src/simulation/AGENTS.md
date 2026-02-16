# Simulation AGENTS.md

> ゲームロジック・AI・戦闘の変更ガイド。数値はソースコード参照。

## Tick順序（update.ts）

1-6は常時実行: `buildHash()` → `updateSwarmN()` → `resetReflectedSet()` → per unit(`steer` → `combat` → trail、`codexOpen`時は非デモユニットをスキップ) → `applyReflectorShields(dt)`（`decayShieldTimers` → `shieldNearbyAllies`） → projectile pass → particle pass → beam pass → trackingBeam pass
7は`!codexOpen`時のみ: `reinforce(dt)`。codexOpen時は`updateCodexDemo(dt)`実行。

**重要**: Reflector付与(step 4)はcombat(step 3)の後→`shieldLingerTimer`は次フレームで有効。`shieldLingerTimer`はReflector範囲内にいる間は毎フレーム`REFLECTOR_SHIELD_LINGER`にリセットされ、範囲離脱後に減衰を開始する。

## 変更ガイド

### 新攻撃パターン追加
`types.ts`(新フラグ) → `unit-types.ts`(フラグ設定) → `combat.ts`(NORMAL FIREの前にif分岐挿入) → `spawn.ts`(新Unitプロパティ時)。排他パターンなら`return`、共存なら`return`なし。

### combat分岐フロー
排他(`return`あり): rams → reflects → emp → chain → beam。非排他: heals, spawns, teleports。最後: NORMAL FIRE(homing/aoe/5-burst/railgun/default)。`tgtDistOrClear(u)`でターゲット検証+距離取得を一括処理。

### steering変更
力の合成: `fx/fy`に各力加算→角速度`u.angle`に反映。stun時: vx/vy\*=0.93、steering力スキップ。Boids3要素(Separation/Alignment/Cohesion)。ターゲット: 近傍→1.2%全域スキャン→wanderAngle。境界力: `WORLD_SIZE*0.8`超で押し戻し。

### 増援変更
確率テーブルは`reinforcements.ts`参照。単一乱数`r`で複数タイプ同時spawn可能。低ユニット数ゲート(`cnt<50`/`cnt<40`)で劣勢チームのみ強力ユニット出現。

## Critical Gotchas

- `dt`は0.033でクランプ（`update()`冒頭）
- `killUnit()`はプールindex引数。Unit参照ではない
- `u.target`はプールindex。-1=なし。ターゲットの`.alive`必ずチェック
- `beams`/`trackingBeams`は動的配列でswap-and-pop削除→順序不定
- `explosion()`のkiller引数: -1=不明、有効indexならvet/kills加算
- `getNeighbors()`は`buildHash()`後のみ有効。途中のユニット追加は反映されない

