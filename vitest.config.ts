import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    // Limit parallelism so workers stay dedicated to a batch of files,
    // avoiding vi.mock() pollution that occurs when vitest reshuffles files
    // across workers mid-run. 4 workers gives ~4× speedup on the test phase
    // while keeping worker affinity stable.
    // See: https://github.com/vitest-dev/vitest/issues/3476
    fileParallelism: true,
    maxWorkers: 4,
    // Keep isolate: true (default) to prevent test state from bleeding
    // between files across different workers.
    isolate: true,
    // Coverage is disabled by default — run with --coverage flag or CI_VITEST_COVERAGE=1
    // to collect coverage data. This keeps local test runs fast.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['apps/forge/src/**/*.ts', 'packages/mastra-engine/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts'],
      default: {
        enabled: false,
      },
    },
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
