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
    // Run test files sequentially (one at a time) to prevent vi.mock() global hoisting
    // from polluting other test files. With parallel execution (default), vitest's
    // worker pool assigns files non-deterministically, causing intermittent failures
    // in company-cash-ledger.test.ts when agent tests run in the same worker and
    // call vi.mock('../finance/company-cash-ledger') at module-eval time.
    // See: https://github.com/vitest-dev/vitest/issues/3476
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@mastra-engine/core': path.resolve(__dirname, './packages/mastra-engine/dist/index.js'),
      // Alias @forge-runtime/core to source so vi.mock() can resolve the module
      // without requiring a prior build step (dist/index.js doesn't exist in dev).
      '@forge-runtime/core': path.resolve(__dirname, './packages/forge-runtime-core/src/index.ts'),
      // Discord.js is not installed in the test environment.
      // Stub it so modules that import 'discord' (e.g. discord-account.ts) can load in tests.
      discord: path.resolve(__dirname, './__mocks__/discord.js'),
    },
  },
});