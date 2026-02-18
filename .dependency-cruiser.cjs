module.exports = {
  forbidden: [
    {
      name: 'no-state-in-leaf-simulation',
      severity: 'error',
      comment:
        '末端 simulation モジュールは state.ts を直接 import してはいけない。rng/state は統合レイヤー（update/init/spawn）経由で引数として受け取ること。',
      from: {
        path: '^src/simulation/',
        pathNot: '(update|init|spawn)\\.ts$',
      },
      to: {
        path: '^src/state\\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.ts$|__test__' },
  },
};
