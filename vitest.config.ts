import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
      benchmark: {
        include: ['src/**/*.bench.ts'],
      },
    },
  }),
);
