import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
      testTimeout: 3000,
      hookTimeout: 3000,
      benchmark: {
        include: ['src/**/*.bench.ts'],
      },
    },
  }),
);
