import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One version for the whole app: the host's package.json.
const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../host/package.json'), 'utf8')).version as string;

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(import.meta.dirname, '../shared') } },
  server: {
    // Listen on all addresses so the phone can open the dev server too.
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
