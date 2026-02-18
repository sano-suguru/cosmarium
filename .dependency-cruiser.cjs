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
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.ts$|__test__' },
  },
};
