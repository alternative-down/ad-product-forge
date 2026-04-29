import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['apps/forge/src/**/*.ts', 'packages/mastra-engine/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@mastra-engine/core': path.resolve(__dirname, './packages/mastra-engine/dist/index.js'),
      // Alias @forge-runtime/core to source so vi.mock() can resolve the module
      // without requiring a prior build step (dist/index.js doesn't exist in dev).
      '@forge-runtime/core': path.resolve(__dirname, './packages/forge-runtime-core/src/index.ts'),
    },
  },
});
