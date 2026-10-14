import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { sqlitePreservationPlugin } from './scripts/sqlite-compat/patch.mjs';

export default defineConfig({
  plugins: [sqlitePreservationPlugin(), react()],
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es', plugins: () => [sqlitePreservationPlugin()] },
  test: { environment: 'node', exclude: ['tests/browser/**', 'node_modules/**', 'dist/**'] },
});
