import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { sqlitePreservationPlugin } from './scripts/sqlite-compat/patch.mjs';

export default defineConfig({
  plugins: [sqlitePreservationPlugin(), react()],
  optimizeDeps: { include: ['parse5'], exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es', plugins: () => [sqlitePreservationPlugin()] },
  build: {
    assetsInlineLimit(filePath) {
      if (filePath.includes('microphone-capture-worklet')) return false;
    },
  },
  test: { environment: 'node', maxWorkers: 2, exclude: ['tests/browser/**', 'node_modules/**', 'dist/**'] },
});
