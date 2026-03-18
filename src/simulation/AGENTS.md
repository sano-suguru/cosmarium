# Simulation AGENTS.md

> ゲームロジック・AI・戦闘の変更ガイド。数値はソースコード参照。

## Tick順序（update.ts）

1-6は常時実行: `buildHash()` → `resetReflected()` → `updateSquadronObjectives()`
→ `processAllUnits()` (per unit: swarmN計算 → `steerWithNeighbors` → `combat` → trail)
→ `decayAndRegen()` → `applyAllFields()` (フィールドユニットのみ: shields/amp/scramble/catalyst/reflect)
→ projectile pass → particle pass → beam pass → chain pass → trackingBeam pass
7は`!codexOpen`時のみ: `reinforce(dt)`。codexOpen時は`updateCodexDemo(dt)`実行。

**重要**:
- `processAllUnits` 内の `getNeighbors` は `NeighborSlice` を返す。swarm+steer で即座に消費すること（combat 後はバッファ無効）
- フィールド付与は全ユニット combat 完了後に `applyAllFields` で独立パス実行（NeighborSlice 破損・順序依存性を回避）
- `decayAndRegen` は全ユニット処理後に一括実行

## 変更ガイド

### 新攻撃パターン追加
`types.ts`(新フラグ) → `unit-types.ts`(フラグ設定) → 対応する `combat-*.ts` に実装 → `combat.ts` のディスパッチに分岐追加 → `spawn.ts`(新Unitプロパティ時)。排他パターンなら`return`、共存なら`return`なし。

### sweep攻撃
sweep は排他パターン（return あり）。sweepPhase/sweepBaseAngle で扇形回転攻撃を実装。`combat-sweep.ts` に実装。

### combat分岐フロー
`combat.ts` がエントリポイント。実行順（上から順にif判定）: rams(排他) → heals(非排他) → reflects(排他) → spawns(非排他) → emp(排他) → teleports(非排他) → chain(排他) → sweep(排他) → broadside(排他) → beam(排他)。最後: NORMAL FIRE(homing/aoe/shots>1/railgun/default)。`tgtDistOrClear(u)`でターゲット検証+距離取得を一括処理。

### steering変更
力の合成: `fx/fy`に各力加算→角速度`u.angle`に反映。stun時: vx/vy\*=0.93、steering力スキップ。Boids3要素(Separation/Alignment/Cohesion)。ターゲット: 近傍→1.2%全域スキャン→wanderAngle。境界力: `WORLD_SIZE*0.8`超で押し戻し。

### 増援変更
確率テーブルは`reinforcements.ts`参照。単一乱数`r`で複数タイプ同時spawn可能。低ユニット数ゲート(`cnt<50`/`cnt<40`)で劣勢チームのみ強力ユニット出現。

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| combat.ts | エントリポイント: `combat()`, `dispatchSupportAbilities`, `tryExclusiveFire`, `demoFlag` |
| combat-context.ts | `CombatContext` インターフェース定義 |
| combat-aim.ts | `aimAt`, `tgtDistOrClear`, `swarmDmgMul` — 照準・ターゲット計算 |
| combat-beam-defense.ts | ビーム防御: `applyBeamDefenses`, 反射・吸収・テザー |
| combat-reflect.ts | Reflector プロジェクタイル反射: `reflectProjectile`, `reflectProjectiles` |
| combat-sweep.ts | Sweep beam: `sweepBeam`, sweep VFX, `_resetSweepHits` |
| combat-focus-beam.ts | Focus beam: `focusBeam` |
| combat-fire.ts | 通常射撃: `fireNormal`, `dispatchFire` |
| combat-railgun.ts | Railgun ヒットスキャン: `fireRailgun`, `collectRayHits` |
| combat-flagship.ts | Flagship 専用: `flagshipBarrage` |
| combat-special.ts | 特殊: `ramTarget`, `healAllies`, `teleport`, `castChain` 等 |
| combat-support.ts | 支援VFX + 定数: `shieldAllies`, `amplifyAllies` 等（バフ付与ロジックは update-fields.ts） |
| update.ts | tick本体。stepOnce（固定dtで1ステップ）、per-unit/particle/beam更新、swarmN |
| update-projectiles.ts | プロジェクタイル全処理: 移動・ヒット検出・AOE・反射・追尾 |
| update-fields.ts | エネルギー回復 + シールド/フィールド/バフ/デバフ decay・付与 |
| effects.ts | killUnit/destroyUnit/destroyMutualKill + explosion エフェクト生成 |
| effects-trail.ts | trail/flagshipTrail/boostBurst/boostTrail — 移動パーティクルエフェクト |
| chain-lightning.ts | チェインライトニング: chainLightning/updateChains/resetChains/snapshot・restore |
| steering.ts | メインステアリング: steer/steerWithNeighbors/resolveTarget/boost/velocity |
| boids.ts | Boids計算: computeBoidsForce/computeBoidsAndFindLocal/accumulateBoidsNeighbor |
| steering-forces.ts | 力の計算: computeEngagementForce/RetreatForce/HealerFollow/AllyCentroidFollow |
| spawn.ts | spawn/killParticle/killProjectile。プール操作のエントリポイント（killUnit は effects.ts） |
| hotspot.ts | 戦闘ホットスポット検出（updateHotspot/hotspot/resetHotspot） |
| reinforcements.ts | 確率テーブルによる増援spawn |
| spatial-hash.ts | buildHash + getNeighbors（NeighborSlice を返すシングルトンAPI） |
| on-kill-effects.ts | キル時効果（cooldownリセット、blinkタイマー短縮）。KillContext別に適用判定 |
| enemy-fleet.ts | Public API: `generateEnemySetup` — 固定NPC + Bot艦隊オーケストレータ |
| enemy-fleet-bot.ts | Bot購入シミュレーション: `botFillSlots` — ショップ制約準拠スロット構築 |
| enemy-fleet-profile.ts | 艦隊プロファイリング: `profileFleet`, `pickMothershipTypeByRound`, `deriveArchetypeFromProfile` |
| init.ts | INIT_SPAWNS。ゲーム開始時のユニット配置 |

ベンチマーク: `spawn.bench.ts`、`update.bench.ts`。

## Critical Gotchas

- `stepOnce(SIM_DT)` が唯一のpublic API。main.ts の `drainAccumulator` が固定 dt 刻みで呼び出し（最大8ステップ/フレーム）
- `beams`/`trackingBeams`は動的配列でswap-and-pop削除→順序不定
- `destroyUnit()` = `killUnit()` + `explosion()`。ユニット死亡時は必ず `destroyUnit()` を使うこと。`killUnit()` は effects.ts のプール操作、`explosion()` は純粋な視覚エフェクト（パーティクル生成のみ）
- `on-kill-effects.ts`: `KILL_CONTEXT` で攻撃種別を分類。`ProjectileDirect` のみ cooldown リセット適用
