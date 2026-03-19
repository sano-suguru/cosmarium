# COSMARIUM システム概要調査結果

## 1. ユニットタイプシステム
**現状: 完全実装 ✓**

### ユニット数: 24型
- **Attack役 (10)**: Drone, Fighter, Bomber, Cruiser, Flagship, Sniper, Lancer, Launcher, Scorcher, Arcer
- **Support役 (5)**: Healer, Reflector, Bastion, Amplifier, Catalyst
- **Special役 (5)**: Carrier(ドローン射出), Teleporter(ブリンク), Disruptor(EMP), Scrambler(妨害), Hive(母艦)
- **Environment/Mothership (4)**: Asteroid, AsteroidLarge, Dreadnought(母艦), Reactor(母艦)

### パラメータ体系
```typescript
UnitType {
  name, role, cost, size, hp, speed, turnRate, fireRate, attackRange, aggroRange,
  damage, shape, trailInterval, mass, accel, drag, leadAccuracy, aoe, carpet, beam,
  heals, reflects, spawns, homing, rams, emp, teleports, chain, sweep, swarm, broadside,
  shots, salvo, cannonOffsets, boost, massWeight, engageMin, engageMax, cooldownResetOnKill,
  retreatHpRatio, shields, amplifies, scrambles, catalyzes, supportFollow, maxEnergy,
  energyRegen, shieldCooldown, clusterSize
}
```

### コスト範囲
- Low tier (≤3): Drone(1), Fighter(3), Healer(4), Teleporter(4), Disruptor(4), Scrambler(4), Amplifier(4), Catalyst(4), Arcer(4)
- Mid tier (4-6): Bomber(5), Lancer(6), Launcher(5), Scorcher(5), Bastion(6), Reflector(5), Carrier(9)
- High tier (>6): Cruiser(8), Flagship(20), Sniper(3 but high damage)

## 2. Boidsパラメータ
**現状: 実装済み (boids.ts)**

```typescript
const SEPARATION_SCALE = 400;
const SEPARATION_WEIGHT = 3;
const ALIGNMENT_WEIGHT = 0.5;
const COHESION_WEIGHT = 0.01;
const COHESION_RANGE = 150;
const ALIGNMENT_RANGE = 120;
const NEIGHBOR_RANGE = 200; // spatial hash bucket size

// 分離距離: size * 6
```

### ターゲット選択
- `targetScore()` = distance² / (1 + massWeight * mass)²
- aggroRange: 型定義で [aggroRange, aggroRange] の敵を探索
- 空間ハッシュ + boids計算を1パスで実行

## 3. マージ/レベルシステム
**現状: 経験値ベース実装 ✓**

- `mergeExp`: [0,1,2,3,4,5] → MAX_MERGE_EXP=5
- Level = mergeExpToLevel(exp): 1-2-3に対応
  - exp < 2 → level 1
  - 2 ≤ exp < 5 → level 2
  - exp ≥ 5 → level 3
- HP/Damage倍率: `dmgMul = 1 + mergeExp * MERGE_STAT_BONUS`
  - MERGE_STAT_BONUS = 0.04 (4%/exp)
  - max 5exp → 1.20x (20%増強)
- 生産時間短縮: `productionTime = baseCost * productionMul / (1 + mergeExp * 0.03)`

### スポーン数: 
- mergeExp段階ごとに `baseCount + mergeBonusLevel * mergeBonusCount`
- mergeBonusCount = max(1, floor(baseCount * 0.5))

## 4. モジュール/装備システム
**現状: 存在しない ✗**

→ ユニットに固定された能力フラグ（heals, reflects, spawns等）のみ。
→ 動的な装備/モジュール装着システムなし。

## 5. マザーシップシステム
**現状: 3型実装済み ✓**

```typescript
MothershipDef {
  type, name, description,
  productionTimeMul,        // 生産速度倍率
  attackCdMul,               // 通常射撃クールダウン倍率
  spawnCountMul,             // スポーン数倍率
  creditsPerRound,           // 毎ラウンド追加クレジット
  botWeights: [early, mid, late]  // Bot選択重み
}
```

### 三種類
| 名称 | 特徴 | 生産 | 射撃 | スポーン | 追加Cr |
|------|------|------|------|---------|--------|
| **Hive** | 序盤向け | 0.7x | 1.0x | 1.5x | 0 |
| **Dreadnought** | 重装甲砲台 | 1.3x | 1.0x | 1.0x | 0 |
| **Reactor** | クレジット供給 | 1.0x | 1.0x | 0.8x | +2/round |

### スロット
- SLOT_COUNT = 5 (1母艦あたり)
- MAX_CLUSTERS_PER_TICK = 5 (全スロット共有バースト制限)
- 生産時間 = cost * productionMul / (1 + mergeExp * 0.03)

## 6. 生産システム
**現状: ラウンドロビン実装済み ✓**

```typescript
ProductionState {
  readonly slots: (ProductionSlot | null)[];
  readonly timers: number[];  // 蓄積時間[秒]
}

ProductionSlot {
  type, count, mergeExp
}
```

プロセス:
1. 毎フレーム timer += dt
2. timer ≥ productionTime なら ready
3. ラウンドロビン: ready なスロットから最大1クラスター/tick
4. spawnCluster() で count 個をスポーン

## 7. バランス: 3竢ロック=ペーパー型
**現状: 敵艦隊アーキタイプは実装済み ✓**

### 敵AI艦隊アーキタイプ分類 (enemy-fleet-profile.ts)
```
deriveArchetypeFromProfile(profile):
- 攻撃型: roles.attack/total ≥ 60%
- 防壁型: support ≥ 2 + defensive + attack < 50%
- 支援型: support/total ≥ 40%
- 奇襲型: special/total ≥ 40%
- スウォーム型: 全Low cost
- 重装型: hasHigh cost
- 混成型: 上記以外
```

### ティア重み (shop-tiers.ts)
```
早期(round ≤ 3): Low=3, Mid=1, High=0
中期(round ≤ 6): Low=2, Mid=2, High=1
後期(round > 6):  Low=1, Mid=2, High=2
```

### コスト分類
- Low: cost ≤ 3 (Drone 1, Fighter 3, etc.)
- Mid: cost ≤ 6 (Bomber 5, Bastion 6, etc.)
- High: cost > 6 (Cruiser 8, Flagship 20)

### 欠落: 明示的な「ロック=ペーパー=ハサミ」フォーミュラ
→ アーキタイプ名は生成されるが、
→ 相互バランス値（A型はB型に+20%等）は存在しない

## 8. サポートシステム
**現状: フィールドバフ実装済み ✓**

- **Healer**: 修復ビーム (supportFollow=1)
- **Reflector**: シールド反射 (maxEnergy=40, shieldCooldown=3)
- **Bastion**: ダメージ吸収テザー (shields=true, maxEnergy=25, energyRegen=4)
- **Amplifier**: 攻撃バフ → AMP_DAMAGE_MULT = 1.2 (supportFollow=1)
- **Catalyst**: 加速バフ → CATALYST_SPEED_MULT, CATALYST_TURN_MULT (supportFollow=1)

各サポート型は `supportFollow: 0-1` の値で味方追従強度を制御

## 要約: 何が実装されて、何が未実装か

| 項目 | 状態 | 詳細 |
|------|------|------|
| ユニット定義 | ✓ | 24型完備、parameter完備 |
| Boids | ✓ | separation/alignment/cohesion実装 |
| ターゲット選択 | ✓ | mass-weighted distance scoring |
| マージシステム | ✓ | 経験値→レベル→stat/production倍率 |
| モジュール | ✗ | 装備システムなし（固定能力のみ） |
| マザーシップ | ✓ | 3型、倍率ベース |
| 生産システム | ✓ | ラウンドロビンスポーン |
| 支援システム | ✓ | フィールドバフ/healing実装 |
| ロック=ペーパー | △ | アーキタイプ名は生成、バランス値はなし |

