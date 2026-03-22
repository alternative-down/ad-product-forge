import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  external: [
    '@mastra/core',
    '@mastra/fastembed',
    '@mastra/libsql',
    '@mastra/memory',
    '@mastra/rag',
    '@ai-sdk/anthropic',
    '@ai-sdk/openai',
    '@libsql/client',
    '@mendable/firecrawl-js',
    'drizzle-kit',
    'drizzle-orm',
    'zod',
  ],
})
