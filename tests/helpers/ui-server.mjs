import { spawn } from 'node:child_process';
import { mockSupabase } from './mock-supabase.mjs';
const provider = await mockSupabase();
const child = spawn(process.execPath, ['dist/server/server.mjs'], { stdio: 'inherit', env: {
  ...process.env, APP_ORIGIN: 'http://127.0.0.1:3100', SUPABASE_URL: provider.url,
  SUPABASE_PUBLISHABLE_KEY: 'mock-publishable-key',
} });
const stop = async () => { child.kill(); await provider.stop(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('exit', async code => { await provider.stop(); process.exit(code ?? 0); });
