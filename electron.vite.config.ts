import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'apps/main/index.ts') } },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'apps/shared') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'apps/preload/index.ts') } },
    },
    resolve: { alias: { '@shared': resolve(__dirname, 'apps/shared') } },
  },
  renderer: {
    root: resolve(__dirname, 'apps/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'apps/renderer/index.html') },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'apps/renderer/src'),
        '@shared': resolve(__dirname, 'apps/shared'),
      },
    },
  },
});
