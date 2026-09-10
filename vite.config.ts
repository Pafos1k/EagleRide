import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
});
