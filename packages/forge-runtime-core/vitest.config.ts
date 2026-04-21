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
});
