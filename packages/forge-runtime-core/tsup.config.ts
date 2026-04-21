import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  external: [
    'agent-runtime-core',
    'agent-runtime-core/integrations',
    'zod',
  ],
});
