import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  skipNodeModulesBundle: true,
})
