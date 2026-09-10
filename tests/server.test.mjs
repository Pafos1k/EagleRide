import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'dist/server/server.mjs');
let temporaryDirectory;
let server;
let origin;

function launch(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.GEMINI_API_KEY;
  delete env.API_KEY;
  // Prevent a developer's local credentials from reaching regression tests.
  env.DOTENV_CONFIG_PATH = path.join(temporaryDirectory, '.env');
  return spawn(process.execPath, [entry], {
    cwd: temporaryDirectory,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'eagleride-test-'));
  await writeFile(path.join(temporaryDirectory, '.env'), 'PORT=12345\n');
  // Explicit PORT must win over .env; compiled production must not load Vite,
  // even with an inherited development NODE_ENV or a different working directory.
  server = launch({ PORT: '0', NODE_ENV: 'development' });
  origin = await new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timer = setTimeout(() => reject(new Error(`Startup timeout: ${errors}`)), 15000);
    server.stderr.on('data', chunk => { errors += chunk; });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Server running on http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
}, { timeout: 20000 });

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test('health endpoint and explicit PORT work without runtime Vite', async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.notEqual(new URL(origin).port, '12345');
});

test('serves the built document, JavaScript, and local Tailwind CSS', async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /EagleRide BC/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')));
  assert.ok(assets.some(asset => asset.endsWith('.css')));
  for (const asset of assets) {
    const result = await fetch(`${origin}${asset}`);
    assert.equal(result.status, 200, asset);
    if (asset.endsWith('.css')) assert.match(await result.text(), /\.bg-bc-maroon/);
  }
});

test('all existing image URLs return image bytes', async () => {
  for (const name of ['EagleLogo.png', 'iPhone.png', 'Vlad.jpg', 'venmo.jpg', 'CashApp.jpg', 'PayPal.jpg']) {
    const response = await fetch(`${origin}/${name}`);
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get('content-type'), /^image\//);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path.join(root, 'public', name)));
  }
});

test('server bundles, source maps, secrets and missing resources are not public', async () => {
  for (const url of ['/server.cjs', '/server.cjs.map', '/server.mjs', '/server/server.mjs', '/server/server.mjs.map', '/dist/server/server.mjs', '/..%2fserver%2fserver.mjs', '/.env', '/server.ts', '/package.json', '/api/missing', '/assets/missing.js']) {
    const response = await fetch(`${origin}${url}`);
    assert.equal(response.status, 404, url);
  }
  assert.equal((await fetch(origin, { method: 'POST' })).status, 404);
});

test('preserves both existing Gemini no-key fallbacks without external calls', async () => {
  const post = (url, body) => fetch(`${origin}${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const recommendations = await post('/api/recommendations', { userProfile: '{}', availableRides: '[]' });
  assert.equal(recommendations.status, 200);
  assert.deepEqual(await recommendations.json(), { recommendations: [] });
  const guidance = await post('/api/location-guidance', { pickupZone: 'Newton', destinationAddress: 'Logan' });
  assert.equal(guidance.status, 200);
  assert.deepEqual(await guidance.json(), {
    text: 'Drivers meeting at Newton typically pull up alongside the main passenger loading zone or designated campus circle. Coordinate in your group chat upon driver arrival!',
    links: [],
  });
});

test('rejects malformed JSON and bodies over the existing 1 MB limit', async () => {
  const request = body => fetch(`${origin}/api/recommendations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(JSON.stringify({ text: 'x'.repeat(1024 * 1024) }))).status, 413);
});

test('invalid PORT fails with a clear configuration error', async () => {
  const child = launch({ PORT: 'not-a-port' });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(errors, /PORT must be an integer/);
});
