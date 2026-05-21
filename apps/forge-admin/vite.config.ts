import path from 'path';
import { defineConfig } from 'vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      autoCodeSplitting: true,
      routeFileIgnorePattern:
        '-section|-helpers|-types|-profile|-llm|-oauth|-build-scene|-finance-accounts|-movements|-use-agent|-use-ltm|-log-metrics|-runtime-memory|\\.types\\.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3021,
    proxy: {
      '/admin': {
        target: 'http://localhost:3011',
        changeOrigin: true,
      },
    },
  },
});
