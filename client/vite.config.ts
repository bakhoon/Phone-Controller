import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(import.meta.dirname, '../shared') } },
  server: {
    // Listen on all addresses so the phone can open the dev server too.
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
