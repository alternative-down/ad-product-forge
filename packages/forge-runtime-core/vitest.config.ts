import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'agent-runtime-core/integrations': path.resolve(
        __dirname,
        '../agent-runtime-core/dist/integrations-entry.js',
      ),
    },
  },
  test: {
    // These settings are inherited from root vitest.config.ts but explicitly
    // declared here for clarity. forge-runtime-core tests run in parallel
    // (4 workers) via turbo when NOT cascading via ^build.
    fileParallelism: true,
    maxWorkers: 4,
  },
});