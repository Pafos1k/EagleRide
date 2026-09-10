import { rm, cp } from 'node:fs/promises';
import { build as buildClient } from 'vite';
import { build as buildServer } from 'esbuild';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await buildClient();
await buildServer({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  outfile: 'dist/server/server.mjs',
  banner: { js: "process.env.NODE_ENV = 'production';" },
  // Eliminate development middleware, including the Vite import, from production.
  define: { 'process.env.NODE_ENV': '"production"' },
});

await buildServer({
  entryPoints: ['server/migrate.ts'], bundle: true, platform: 'node', format: 'esm',
  target: 'node22', packages: 'external', outfile: 'dist/server/migrate.mjs',
});
await cp(new URL('../server/migrations/', import.meta.url), new URL('../dist/server/migrations/', import.meta.url), { recursive: true });
