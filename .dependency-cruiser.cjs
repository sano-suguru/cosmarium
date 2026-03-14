module.exports = {
  forbidden: [
    {
      name: 'no-state-in-leaf-simulation',
      severity: 'error',
      comment:
        'simulation モジュールは state.ts を直接 import してはいけない。rng/state は呼び出し元から引数として受け取ること。',
      from: {
        path: '^src/simulation/',
      },
      to: {
        path: '^src/state\\.ts$',
      },
    },
    {
      name: 'no-input-in-simulation',
      severity: 'error',
      comment: 'simulation モジュールは input/ を直接 import してはいけない。コールバック注入で依存を逆転させること。',
      from: {
        path: '^src/simulation/',
      },
      to: {
        path: '^src/input/',
      },
    },
    {
      name: 'no-ui-in-simulation',
      severity: 'error',
      comment: 'simulation モジュールは ui/ を直接 import してはいけない。コールバック注入で依存を逆転させること。',
      from: {
        path: '^src/simulation/',
      },
      to: {
        path: '^src/ui/',
      },
    },
    {
      name: 'no-direct-pools-init-import',
      severity: 'error',
      comment:
        'pools-init.ts は生のプール配列を公開する。pools.ts, pools-query.ts, pools-particle.ts 以外からの直接 import を禁止。',
      from: {
        path: '^src/',
        pathNot: '^src/pools(-query|-particle)?\\.ts$',
      },
      to: {
        path: '^src/pools-init\\.ts$',
      },
    },
    {
      name: 'no-client-in-worker',
      severity: 'error',
      comment: 'worker/ はクライアントコード (src/) を import してはいけない。worker はサーバーサイドのみ。',
      from: {
        path: '^worker/',
      },
      to: {
        path: '^src/',
      },
    },
    {
      name: 'no-codex-to-game-control',
      severity: 'error',
      comment:
        'codex-logic.ts → game-control.ts は循環依存になるため禁止。game-control → codex-logic の一方向のみ許可。',
      from: { path: '^src/ui/codex/' },
      to: { path: '^src/ui/game-control\\.ts$' },
    },
    {
      name: 'no-shop-state-in-simulation',
      severity: 'error',
      comment:
        'simulation/ は shop.ts（ステートフル）を import してはいけない。純粋定義は shop-tiers.ts を使用すること。',
      from: { path: '^src/simulation/' },
      to: { path: '^src/shop\\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.ts$|__test__' },
  },
};
