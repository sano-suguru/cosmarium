# AGENTS.md — COSMIC WARFARE

> AI向けナビゲーションガイド。CLAUDE.mdの構造・略称・メカニクス情報を前提とし、**変更作業時の判断指針**を補完する。

## Quick Reference

- **言語**: 日本語で返答
- **型チェック**: `bunx tsc --noEmit` — strict mode、未使用変数警告なし
- **ビルド**: `bunx vite build` — dist/へ出力
- **テスト**: なし（手動確認のみ）
- **リンター/フォーマッター**: なし — 既存スタイルに合わせること

## Dependency Graph (変更影響マップ)

```
types.ts ← 全ファイルが依存（型定義の変更は全体に波及）
constants.ts ← pools.ts, simulation/*, renderer/*
state.ts ← main.ts, simulation/update.ts, ui/game-control.ts
pools.ts ← simulation/spawn.ts, simulation/update.ts, renderer/render-scene.ts
colors.ts ← renderer/render-scene.ts, simulation/spawn.ts
unit-types.ts ← simulation/init.ts, simulation/reinforcements.ts, ui/catalog.ts

main.ts → renderer/*, simulation/update.ts, input/camera.ts, ui/*
         （初期化順序は CLAUDE.md 参照）
```

## ファイル変更ガイド

### 新ユニット追加
1. `unit-types.ts` — `TYPES[]`に定義追加（既存15エントリのフォーマットに従う）
2. `types.ts` — 新フラグが必要なら`Unit`インターフェースに追加
3. `colors.ts` — `TC[]`と`TrC[]`に色ペア追加（index=ユニットtype番号）
4. `simulation/combat.ts` — 新攻撃パターンの分岐を`combat()`に追加
5. `simulation/steering.ts` — 特殊移動ロジックがあれば`steer()`に追加
6. `ui/catalog.ts` — カタログデモに対応シナリオ追加
7. `src/shaders/main.frag.glsl` — 新シェイプが必要ならSDF追加（次の空きID使用）

### 新パーティクルエフェクト追加
1. `simulation/effects.ts` — エフェクト関数を追加（`spP()`でパーティクル生成）
2. 呼び出し元（`combat.ts`や`update.ts`）からインポート

### レンダリング変更
→ `src/renderer/AGENTS.md` 参照

### シミュレーション変更
→ `src/simulation/AGENTS.md` 参照

## State管理パターン

```typescript
// state.ts の var + setter パターン（ESM制約による）
export var gameState: number;
export function setGameState(v: number) { gameState = v; }

// 使用側
import { gameState, setGameState } from './state';
if (gameState === 1) { ... }
setGameState(2); // ✅ setter経由
// gameState = 2; // ❌ ESM再エクスポートでは代入不可

// poolCounts はオブジェクトなのでプロパティ直接変更可
poolCounts.uC++;  // ✅ OK
```

## プールパターン（spawn/kill）

```typescript
// 生成: 最初の dead スロットを線形スキャン
function spU(x, y, type, team, ...): Unit | null {
  for (let i = 0; i < PU; i++) {
    if (!uP[i].alive) { /* 初期化して return */ }
  }
  return null; // プール満杯
}

// 破棄: alive=false にするだけ（メモリ解放なし）
function killU(u: Unit) { u.alive = false; poolCounts.uC--; }
```

新オブジェクト種追加時: `pools.ts`にプール配列+カウンタ追加、`constants.ts`に上限定数追加。

## Critical Gotchas

| 罠 | 理由 |
|----|------|
| `let`でstate変数をexportしない | ESMの再エクスポートは読取専用。`var` + setter必須 |
| プール上限変更時は`constants.ts`と`pools.ts`両方 | `PU`定数とプール配列初期化が別ファイル |
| `_nb`バッファは共有（350要素） | `gN()`の戻り値=バッファ内の有効数。コピーせず即使用 |
| `iD`/`mmD`はFloat32Array | `renderScene()`で毎フレーム書き込み。サイズ=`MAX_I*9` |
| シェーダは`?raw`インポート | `import src from './shaders/x.glsl?raw'` — 文字列として取得 |
| `poolCounts`オブジェクト内のカウンタ手動管理 | spawn/kill時に必ずインクリメント/デクリメント |

## Subdirectory Knowledge

| ディレクトリ | AGENTS.md | 対象 |
|-------------|-----------|------|
| `src/renderer/` | あり | WebGL2パイプライン、シェーダ、FBO、バッファ |
| `src/simulation/` | あり | ゲームロジック、AI、戦闘、空間ハッシュ |
| `src/shaders/` | なし | CLAUDE.mdのShape IDテーブル参照 |
| `src/ui/` | なし | 3ファイル、シンプル。CLAUDE.mdのアーキテクチャツリー参照 |
| `src/input/` | なし | camera.ts 1ファイルのみ |
