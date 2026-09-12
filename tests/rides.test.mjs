import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
import { mockSupabase, cookieClient, alice, bob } from './helpers/mock-supabase.mjs';

// Always create/drop a uniquely named disposable DB, never reset a supplied DB.
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a PostgreSQL connection with CREATEDB permission.');
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
const databaseName = `eagleride_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.pathname = `/${databaseName}`;
const databaseUrl = url.toString();
const db = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
// Pool.end() can resolve before its clients finish closing their sockets.
const databaseConnectionsClosed = [];
db.on('connect', client => {
  databaseConnectionsClosed.push(new Promise(resolve => client.once('end', resolve)));
});
let databaseCreated = false;
let server;
let origin;
let saved;
let provider;
let actor;
let actingUser;
const environment = { ...process.env, APP_ORIGIN: 'http://localhost:3000', DATABASE_URL: databaseUrl, PORT: '0', GEMINI_API_KEY: '', API_KEY: '', DOTENV_CONFIG_PATH: 'tests/.env.disabled' };
async function migrate() {
  const child = spawn(process.execPath, ['dist/server/migrate.mjs'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, errors);
}
async function start(configuredOrigin) {
  const { createServer } = await import('node:net');
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  environment.PORT = String(port); environment.APP_ORIGIN = configuredOrigin ?? `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['dist/server/server.mjs'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  origin = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    server.stderr.resume();
  });
  actor = cookieClient(origin);
  environment.APP_ORIGIN = origin;
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
}
const input = {
  origin: { name: 'Boston College', address: '140 Commonwealth Ave, Chestnut Hill, MA', terminal: null },
  destination: { name: 'Logan Airport (BOS)', address: 'Logan International Airport, Boston, MA', terminal: 'C' },
  departureTime: '2030-03-10T01:30:00-05:00', seatsTotal: 4, luggageType: 'ONE_SUITCASE',
  flexibility: 'PLUS_MINUS_30', estimatedTotalCostCents: 5432, hostNote: null,
};
const post = body => actor.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const count = async () => Number((await db.query('SELECT count(*) FROM rides')).rows[0].count);
before(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  await migrate();
  provider = await mockSupabase();
  environment.SUPABASE_URL = provider.url; environment.SUPABASE_PUBLISHABLE_KEY = 'mock-key';
  await start();
}, { timeout: 30000 });
after(async () => {
  await stop();
  await provider?.stop();
  await db.end();
  await Promise.all(databaseConnectionsClosed);
  if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

test('migrations work on an empty database and are repeatable', async () => {
  assert.equal(await count(), 0);
  assert.deepEqual((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows.map(r => r.table_name), ['messages', 'ride_participants', 'rides', 'schema_migrations', 'users']);
  await migrate();
  assert.equal((await db.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '4');
  assert.equal((await db.query("SELECT full_name FROM users WHERE id='u1'")).rows[0].full_name, 'Baldwin Eagle');
});
test('POST creates a persisted ride and host participation with server identity and timestamps', async () => {
  assert.equal((await actor.login()).status, 302);
  actingUser = await (await actor.request('/api/auth/me')).json();
  const response = await post(input);
  assert.equal(response.status, 201);
  saved = await response.json();
  assert.equal(response.headers.get('location'), `/api/rides/${saved.id}`);
  assert.equal(saved.hostUserId, actingUser.id);
  assert.equal(saved.seatsTaken, 1);
  assert.equal(saved.estimatedTotalCostCents, 5432);
  assert.ok(Number.isFinite(Date.parse(saved.createdAt)));
  const parts = (await db.query('SELECT * FROM ride_participants WHERE ride_id=$1', [saved.id])).rows;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].user_id, actingUser.id);
  assert.equal(saved.participants[0].id, parts[0].id);
  assert.equal(await count(), 1);
});
test('ride and host participant roll back together when participant insertion fails', async () => {
  const previousCount = await count();
  await db.query(`CREATE FUNCTION reject_participant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER test_failure BEFORE INSERT ON ride_participants FOR EACH ROW EXECUTE FUNCTION reject_participant();`);
  try {
    const response = await post(input);
    assert.equal(response.status, 503);
    assert.equal(await count(), previousCount);
    assert.equal((await db.query('SELECT count(*) FROM ride_participants')).rows[0].count, '1');
  } finally {
    await db.query('DROP TRIGGER test_failure ON ride_participants; DROP FUNCTION reject_participant()');
  }
  // The rolled-back connection must remain usable.
  assert.equal((await fetch(`${origin}/api/rides/${saved.id}`)).status, 200);
});
test('invalid inputs and client ownership/timestamps/occupancy are rejected without writes', async () => {
  const previousCount = await count();
  for (const bad of [null, {}, { ...input, seatsTotal: 0 }, { ...input, seatsTotal: 5 }, { ...input, seatsTotal: 2.5 },
    { ...input, departureTime: '2030-01-01T12:00:00' }, { ...input, departureTime: '2030-02-30T12:00:00Z' },
    { ...input, origin: { ...input.origin, name: ' ' } }, { ...input, luggageType: 'LOTS' },
    { ...input, destination: { ...input.destination, terminal: 'D' } },
    { ...input, estimatedTotalCostCents: 3.5 }, { ...input, estimatedTotalCostCents: -1 },
    { ...input, hostUserId: 'u2' }, { ...input, createdAt: '2030-01-01T00:00:00Z' }, { ...input, seatsTaken: 4 },
    { ...input, hostNote: 'x'.repeat(2001) }]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal(await count(), previousCount);
});
test('GET collection and detail return persisted records', async () => {
  const list = await fetch(`${origin}/api/rides`);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).map(r => r.id), [saved.id]);
  const detail = await fetch(`${origin}/api/rides/${saved.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), saved);
});
test('unknown and malformed IDs return 404', async () => {
  for (const id of [randomUUID(), 'r1', 'not-a-uuid']) assert.equal((await fetch(`${origin}/api/rides/${id}`)).status, 404);
});
test('a separate HTTP client can read the same database-backed ride', async () => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const r=await fetch(${JSON.stringify(`${origin}/api/rides/${saved.id}`)}); if(r.status!==200) process.exit(1); console.log((await r.json()).id);`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.equal(output.trim(), saved.id);
});
test('data survives application process restart using the same database', async () => {
  await stop();
  await start();
  await actor.login();
  const response = await fetch(`${origin}/api/rides/${saved.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), saved);
});
test('unique participation, foreign keys, and capacity constraints are enforced by PostgreSQL', async () => {
  await assert.rejects(db.query('INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)', [saved.id, actingUser.id]), { code: '23505' });
  await assert.rejects(db.query('INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)', [saved.id, 'missing']), { code: '23503' });
  await assert.rejects(db.query('INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)', [randomUUID(), 'u1']), { code: '23503' });
  for (const seats of [0, 5]) await assert.rejects(db.query('UPDATE rides SET seats_total=$1 WHERE id=$2', [seats, saved.id]), { code: '23514' });
});
test('BC → Logan and Logan → BC preserve both locations, terminal side, and timestamp instant', async () => {
  assert.deepEqual(saved.origin, input.origin);
  assert.deepEqual(saved.destination, input.destination);
  assert.equal(saved.departureTime, '2030-03-10T06:30:00.000Z');
  const reverse = { ...input, origin: input.destination, destination: input.origin, departureTime: '2030-11-03T01:30:00-04:00' };
  const response = await post(reverse);
  assert.equal(response.status, 201);
  const result = await response.json();
  const persisted = await (await fetch(`${origin}/api/rides/${result.id}`)).json();
  assert.deepEqual(persisted.origin, reverse.origin);
  assert.deepEqual(persisted.destination, reverse.destination);
  assert.equal(persisted.departureTime, '2030-11-03T05:30:00.000Z');
});
test('distinct free-text locations and optional fields round-trip without collapsing', async () => {
  const custom = { ...input, origin: { name: '123 Custom Avenue', address: null, terminal: null }, destination: { name: 'Another exact destination', address: '42 Exact Street', terminal: null }, hostNote: 'Meet outside' };
  const response = await post(custom);
  assert.equal(response.status, 201);
  const ride = await response.json();
  assert.deepEqual(ride.origin, custom.origin);
  assert.deepEqual(ride.destination, custom.destination);
  assert.equal(ride.hostNote, custom.hostNote);
});

test('malformed and oversized ride JSON return clean client errors', async () => {
  for (const [body, status] of [['{', 400], [JSON.stringify({ text: 'x'.repeat(1024 * 1024) }), 413]]) {
    const response = await actor.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('auth: anonymous writes/profile are rejected while GET browsing stays public', async () => {
  const anonymous = cookieClient(origin);
  assert.equal((await anonymous.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 401);
  for (const path of ['/api/auth/me', '/api/auth/profile']) assert.equal((await anonymous.request(path)).status, 401);
  assert.equal((await anonymous.request('/api/rides')).status, 200);
});
test('auth: verified mixed-case BC identity synchronizes once and owns newly created rides', async () => {
  provider.select(bob);
  const client = cookieClient(origin);
  await client.login();
  const first = await (await client.request('/api/auth/me')).json();
  assert.equal(first.bcEmail, 'bob@bc.edu');
  assert.equal(first.fullName, 'Bob Eagle');
  assert.notEqual(first.id, 'u1');
  await client.login();
  assert.deepEqual(await (await client.request('/api/auth/profile')).json(), first);
  assert.equal((await db.query('SELECT count(*) FROM users WHERE auth_subject=$1', [bob.id])).rows[0].count, '1');
  const ride = await client.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(ride.status, 201);
  assert.equal((await ride.json()).hostUserId, first.id);
  provider.select(alice);
});
test('auth: verified exact BC domain only; non-BC, subdomains, malformed and unverified accounts fail', async () => {
  for (const email of ['a@evilbc.edu', 'a@bc.edu.example.com', 'a@dept.bc.edu', 'a@@bc.edu', '@bc.edu', 'a @bc.edu', 'a@gmail.com']) {
    provider.select({ ...alice, id: randomUUID(), email });
    const client = cookieClient(origin);
    const response = await client.login();
    assert.equal(response.headers.get('location'), '/#/signin?error=403', email);
    assert.equal((await client.request('/api/auth/me')).status, 401);
  }
  provider.select({ ...alice, id: randomUUID(), email: 'notverified@bc.edu', email_confirmed_at: null });
  const client = cookieClient(origin);
  assert.equal((await client.login()).headers.get('location'), '/#/signin?error=403');
  provider.select(alice);
  const valid = cookieClient(origin); await valid.login();
  assert.equal((await valid.request('/api/auth/me')).status, 200);
});
test('auth: spoofed ownership/user fields and cross-origin mutations are rejected', async () => {
  const client = cookieClient(origin); await client.login();
  for (const spoof of [{ hostUserId: 'u1' }, { userId: bob.id }, { email: 'bob@bc.edu' }]) {
    const response = await client.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, ...spoof }) });
    assert.equal(response.status, 400);
  }
  const cookie = [...client.jar].map(([k,v]) => `${k}=${v}`).join('; ');
  for (const path of ['/api/rides', '/api/auth/logout', '/api/auth/login']) {
    for (const headers of [{}, { Origin: 'https://evil.example' }]) {
      assert.equal((await fetch(origin + path, { method: 'POST', headers: { ...headers, Cookie: cookie } })).status, 403);
    }
  }
  assert.equal((await client.request('/api/auth/profile/another-user')).status, 404);
  assert.equal((await client.request('/api/auth/profile', { method: 'POST', body: '{}' })).status, 404);
});
function sessionFrom(client) {
  const encoded = [...client.jar].filter(([key]) => key.startsWith('er-auth.')).sort().map(([,v]) => v).join('');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString());
}
function replaceSession(client, value) {
  for (const key of client.jar.keys()) if (key.startsWith('er-auth.')) client.jar.delete(key);
  client.jar.set('er-auth.0', Buffer.from(JSON.stringify(value)).toString('base64url'));
}
test('auth: cookies contain Supabase tokens only, never Google tokens/user claims', async () => {
  const client = cookieClient(origin);
  const response = await client.login();
  const session = sessionFrom(client);
  assert.deepEqual(Object.keys(session).sort(), ['access_token', 'expires_at', 'refresh_token']);
  assert.ok(!JSON.stringify([...client.jar]).includes('GOOGLE_'));
  for (const header of response.headers.getSetCookie()) {
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Path=\//); assert.doesNotMatch(header, /Domain=/);
  }
  const me = await client.request('/api/auth/me');
  assert.equal(me.headers.get('cache-control'), 'private, no-store');
  const user = await me.json();
  assert.deepEqual(Object.keys(user).sort(), ['bcEmail', 'createdAt', 'fullName', 'id']);
});
test('auth: expired sessions refresh and rotate cookies; invalid access/refresh fail closed', async () => {
  const client = cookieClient(origin); await client.login();
  const original = sessionFrom(client);
  replaceSession(client, { ...original, expires_at: 0 });
  assert.equal((await client.request('/api/auth/me')).status, 200);
  assert.notEqual(sessionFrom(client).refresh_token, original.refresh_token);
  replaceSession(client, { ...sessionFrom(client), access_token: 'forged', user: { id: bob.id, email: bob.email } });
  assert.equal((await client.request('/api/auth/me')).status, 401);
  assert.equal(client.jar.size, 0);
  replaceSession(client, { access_token: 'expired', refresh_token: 'invalid', expires_at: 0 });
  assert.equal((await client.request('/api/auth/me')).status, 401);
});
test('auth: logout clears cookies and revokes only the Supabase refresh session', async () => {
  const otherDevice = cookieClient(origin); await otherDevice.login();
  const client = cookieClient(origin); await client.login();
  const before = sessionFrom(client);
  assert.equal((await client.request('/api/auth/logout', { method: 'POST' })).status, 204);
  assert.equal(client.jar.size, 0);
  assert.equal((await client.request('/api/auth/me')).status, 401);
  const replay = cookieClient(origin);
  replaceSession(replay, { ...before, expires_at: 0 });
  assert.equal((await replay.request('/api/auth/me')).status, 401);
  replaceSession(otherDevice, { ...sessionFrom(otherDevice), expires_at: 0 });
  assert.equal((await otherDevice.request('/api/auth/me')).status, 200);
  assert.ok(provider.calls.some(call => call.path === '/auth/v1/logout' && call.search === '?scope=local'));
  assert.ok(provider.calls.every(call => call.path.startsWith('/auth/v1/')));
});
test('auth: callback needs browser-bound PKCE verifier; replayed codes fail', async () => {
  const client = cookieClient(origin);
  const start = await client.request('/api/auth/login', { method: 'POST' });
  const authorize = await fetch((await start.json()).url, { redirect: 'manual' });
  const callback = authorize.headers.get('location');
  const other = cookieClient(origin);
  assert.equal((await other.request(callback)).headers.get('location'), '/#/signin?error=401');
  assert.equal((await client.request(callback)).headers.get('location'), '/#/profile');
  assert.equal((await client.request(callback)).headers.get('location'), '/#/signin?error=401');
});


test('auth: transient verification/refresh failures fail closed without discarding recoverable cookies', async () => {
  const client = cookieClient(origin); await client.login();
  const original = sessionFrom(client);
  provider.fail('/auth/v1/user', 503);
  try {
    assert.equal((await client.request('/api/auth/me')).status, 503);
    assert.deepEqual(sessionFrom(client), original);
  } finally { provider.fail('/auth/v1/user', null); }
  replaceSession(client, { ...original, expires_at: 0 });
  provider.fail('/auth/v1/token', 429);
  try {
    assert.equal((await client.request('/api/auth/me')).status, 503);
    assert.equal(sessionFrom(client).refresh_token, original.refresh_token);
  } finally { provider.fail('/auth/v1/token', null); }
  assert.equal((await client.request('/api/auth/me')).status, 200);
});
test('auth: logout clears cookies even when remote revocation fails and remains idempotent', async () => {
  const client = cookieClient(origin); await client.login();
  provider.fail('/auth/v1/logout', 503);
  try {
    assert.equal((await client.request('/api/auth/logout', { method: 'POST' })).status, 503);
    assert.equal(client.jar.size, 0);
    assert.equal((await client.request('/api/auth/me')).status, 401);
  } finally { provider.fail('/auth/v1/logout', null); }
  assert.equal((await client.request('/api/auth/logout', { method: 'POST' })).status, 204);
  await client.login();
  replaceSession(client, { ...sessionFrom(client), expires_at: 0 });
  assert.equal((await client.request('/api/auth/logout', { method: 'POST' })).status, 204);
  assert.equal(client.jar.size, 0);
});
test('auth: email collisions never link legacy identities or leave callback session cookies', async () => {
  const legacy = (await db.query("SELECT * FROM users WHERE id='u1'")).rows[0];
  provider.select({ ...alice, id: randomUUID(), email: legacy.bc_email });
  const client = cookieClient(origin);
  try {
    assert.equal((await client.login()).headers.get('location'), '/#/signin?error=409');
    assert.equal(client.jar.size, 0);
    assert.equal((await client.request('/api/auth/me')).status, 401);
    assert.equal((await db.query("SELECT auth_subject FROM users WHERE id='u1'")).rows[0].auth_subject, null);
  } finally { provider.select(alice); }
});
test('auth: malformed cookies and failed callback do not authenticate', async () => {
  const client = cookieClient(origin, new Map([['er-auth.0', 'not-json']]));
  assert.equal((await client.request('/api/auth/me')).status, 401);
  await client.request('/api/auth/login', { method: 'POST' });
  assert.ok([...client.jar.keys()].some(key => key.startsWith('er-pkce')));
  assert.equal((await client.request('/api/auth/callback?error=access_denied')).headers.get('location'), '/#/signin?error=400');
  assert.equal(client.jar.size, 0);
});
test('auth: HTTPS deployment sets Secure host-only cookies for PKCE and refreshed sessions', async () => {
  await stop(); await start('https://eagleride.example');
  try {
    const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: 'https://eagleride.example' } });
    assert.equal(response.status, 200);
    assert.ok(response.headers.getSetCookie().length > 0);
    for (const header of response.headers.getSetCookie()) {
      assert.match(header, /; Secure/); assert.match(header, /HttpOnly/); assert.doesNotMatch(header, /Domain=/);
    }
    const client = cookieClient(origin);
    replaceSession(client, { ...provider.issue(alice), expires_at: 0 });
    const me = await client.request('/api/auth/me');
    assert.equal(me.status, 200);
    assert.ok(me.headers.getSetCookie().some(header => /er-auth/.test(header) && /; Secure/.test(header)));
  } finally { await stop(); await start(); }
});


async function newActor() {
  const identity = { ...alice, id: randomUUID(), email: randomUUID() + '@bc.edu' };
  provider.select(identity);
  const client = cookieClient(origin);
  try { await client.login(); } finally { provider.select(alice); }
  return { client, user: await (await client.request('/api/auth/me')).json() };
}
async function newRide(host, overrides = {}) {
  const response = await host.client.request('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, departureTime: new Date(Date.now() + 86400000).toISOString(), ...overrides }) });
  assert.equal(response.status, 201);
  return response.json();
}
const operate = (actor, id, action) => actor.client.request('/api/rides/' + id + '/' + action, { method: 'POST' });
test('operations: public reads stay public; mutations and Activity require authentication', async () => {
  const host = await newActor(), ride = await newRide(host), anonymous = { client: cookieClient(origin) };
  for (const path of ['/api/rides', '/api/rides/' + ride.id]) assert.equal((await anonymous.client.request(path)).status, 200);
  assert.equal((await anonymous.client.request('/api/rides/mine')).status, 401);
  for (const operation of ['join', 'leave', 'cancel']) assert.equal((await operate(anonymous, ride.id, operation)).status, 401);
});
test('operations: join, duplicate/host protection, full capacity, leave retry and rejoin', async () => {
  const host = await newActor(), guest = await newActor(), other = await newActor();
  const ride = await newRide(host, { seatsTotal: 2 });
  assert.equal((await operate(host, ride.id, 'join')).status, 409);
  assert.equal((await operate(guest, ride.id, 'join')).status, 200);
  assert.equal((await operate(guest, ride.id, 'join')).status, 409);
  assert.equal((await operate(other, ride.id, 'join')).status, 409);
  assert.equal((await operate(other, ride.id, 'leave')).status, 409);
  assert.equal((await operate(host, ride.id, 'leave')).status, 409);
  const leave = await operate(guest, ride.id, 'leave');
  assert.equal(leave.status, 200);
  const leftRide = await leave.json();
  assert.equal(leftRide.seatsTaken, 1);
  assert.ok(leftRide.participants.find(p => p.userId === guest.user.id).leftAt);
  assert.equal((await operate(guest, ride.id, 'leave')).status, 200);
  assert.equal((await operate(guest, ride.id, 'join')).status, 200);
  const rows = (await db.query('SELECT * FROM ride_participants WHERE ride_id=$1 AND user_id=$2', [ride.id, guest.user.id])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].left_at, null);
});
test('operations: two concurrent contenders for the last seat produce exactly one join', async () => {
  const host = await newActor(), a = await newActor(), b = await newActor();
  const ride = await newRide(host, { seatsTotal: 2 });
  const locker = await db.connect();
  let settledRequests = Promise.resolve([]);
  try {
    await locker.query('BEGIN'); await locker.query('SELECT id FROM rides WHERE id=$1 FOR UPDATE', [ride.id]);
    // Observe rejections immediately and drain response bodies before cleanup.
    settledRequests = Promise.allSettled([a, b].map(async contender => {
      const response = await operate(contender, ride.id, 'join');
      await response.arrayBuffer();
      return response.status;
    }));
    // Prove both operations are contending on the database lock before release.
    const deadline = Date.now() + 5000;
    let waiting = 0;
    while (Date.now() < deadline) {
      waiting = Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM rides WHERE id=%'")).rows[0].count);
      if (waiting === 2) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, 2, 'both joins must reach the ride-row lock');
    await locker.query('COMMIT');
  } finally {
    // Unblock contenders before awaiting them, including when an assertion fails.
    try { await locker.query('ROLLBACK'); }
    finally { locker.release(); await settledRequests; }
  }
  const outcomes = await settledRequests;
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') throw outcome.reason;
  }
  assert.deepEqual(outcomes.map(outcome => outcome.value).sort(), [200, 409]);
  const persisted = await (await fetch(origin + '/api/rides/' + ride.id)).json();
  assert.equal(persisted.seatsTaken, 2);
  assert.equal((await db.query('SELECT count(*) FROM ride_participants WHERE ride_id=$1 AND left_at IS NULL', [ride.id])).rows[0].count, '2');
});
test('operations: cancellation is host-only, repeatable, and preserves participants/history', async () => {
  const host = await newActor(), guest = await newActor(), other = await newActor();
  const ride = await newRide(host);
  await operate(guest, ride.id, 'join');
  assert.equal((await operate(guest, ride.id, 'cancel')).status, 403);
  const response = await operate(host, ride.id, 'cancel'); assert.equal(response.status, 200);
  const cancelled = await response.json();
  assert.ok(cancelled.cancelledAt); assert.equal(cancelled.participants.length, 2);
  assert.deepEqual(await (await operate(host, ride.id, 'cancel')).json(), cancelled);
  assert.equal((await operate(other, ride.id, 'join')).status, 409);
  assert.equal((await operate(guest, ride.id, 'leave')).status, 409);
  assert.equal((await fetch(origin + '/api/rides/' + ride.id)).status, 200);
  const discovery = await (await fetch(origin + '/api/rides')).json();
  assert.ok(discovery.every(item => !item.cancelledAt));
  assert.ok(!discovery.some(item => item.id === ride.id));
  for (const actor of [host, guest]) {
    const activity = await (await actor.client.request('/api/rides/mine')).json();
    assert.equal(activity.find(item => item.id === ride.id)?.category, 'cancelled');
  }
});
test('operations: missing/departed rides and supplied identity fields are rejected', async () => {
  const host = await newActor(), guest = await newActor();
  const past = await newRide(host, { departureTime: new Date(Date.now() - 10000).toISOString() });
  assert.equal((await operate(guest, past.id, 'join')).status, 409);
  for (const action of ['join', 'leave', 'cancel']) {
    assert.equal((await operate(guest, randomUUID(), action)).status, 404);
    assert.equal((await operate(guest, 'invalid', action)).status, 404);
    assert.equal((await guest.client.request('/api/rides/' + past.id + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: host.user.id }) })).status, 400);
  }
});
test('operations: Activity uses current-user PostgreSQL membership and accurate categories', async () => {
  const host = await newActor(), guest = await newActor(), stranger = await newActor();
  const upcoming = await newRide(host), past = await newRide(host, { departureTime: new Date(Date.now() - 1000).toISOString() });
  const cancelled = await newRide(host, { departureTime: new Date(Date.now() - 1000).toISOString() });
  await operate(host, cancelled.id, 'cancel');
  await operate(guest, upcoming.id, 'join');
  const response = await guest.client.request('/api/rides/mine');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const joined = await response.json(); assert.equal(joined.length, 1);
  assert.equal(joined[0].id, upcoming.id); assert.equal(joined[0].role, 'participant'); assert.equal(joined[0].category, 'upcoming');
  const hosted = await (await host.client.request('/api/rides/mine')).json();
  assert.equal(hosted.length, 3); assert.ok(hosted.every(r => r.role === 'host'));
  assert.equal(hosted.find(r => r.id === past.id).category, 'past');
  assert.equal(hosted.find(r => r.id === cancelled.id).category, 'cancelled');
  assert.deepEqual(await (await stranger.client.request('/api/rides/mine')).json(), []);
  await operate(guest, upcoming.id, 'leave');
  assert.deepEqual(await (await guest.client.request('/api/rides/mine')).json(), []);
  await operate(guest, upcoming.id, 'join'); await operate(host, upcoming.id, 'cancel');
  assert.equal((await (await guest.client.request('/api/rides/mine')).json())[0].category, 'cancelled');
  const cancelledActivity = await (await host.client.request('/api/rides/mine')).json();
  assert.ok(!cancelledActivity.filter(r => r.category === 'upcoming').some(r => r.id === upcoming.id));
  assert.ok(cancelledActivity.some(r => r.id === upcoming.id && r.category === 'cancelled'));
  assert.equal((await db.query('SELECT count(*) FROM rides WHERE id=$1', [upcoming.id])).rows[0].count, '1');
  assert.equal((await db.query('SELECT count(*) FROM ride_participants WHERE ride_id=$1', [upcoming.id])).rows[0].count, '2');
});
test('operations: cross-origin mutations cannot join, leave or cancel', async () => {
  const host = await newActor(), ride = await newRide(host);
  const cookie = [...host.client.jar].map(([k,v]) => k + '=' + v).join('; ');
  for (const operation of ['join', 'leave', 'cancel']) {
    assert.equal((await fetch(origin + '/api/rides/' + ride.id + '/' + operation, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status, 403);
  }
});

const history = (actor, id) => actor.client.request('/api/rides/' + id + '/messages');
const message = (actor, id, body) => actor.client.request('/api/rides/' + id + '/messages', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
test('chat: host and participant send/read persisted messages with server identity and ordering', async () => {
  const host = await newActor(), guest = await newActor(), ride = await newRide(host);
  await operate(guest, ride.id, 'join');
  assert.deepEqual((await (await history(host, ride.id)).json()).messages, []);
  const posted = await message(host, ride.id, { body: '  Meet at the gate  ' });
  assert.equal(posted.status, 201);
  const first = (await posted.json()).messages[0];
  assert.equal(first.senderUserId, host.user.id);
  assert.equal(first.body, 'Meet at the gate');
  assert.ok(first.createdAt);
  const responses = await Promise.all([message(guest, ride.id, { body: 'On my way' }), message(host, ride.id, { body: 'Thanks' })]);
  assert.ok(responses.every(r => r.status === 201));
  await Promise.all(responses.map(r => r.arrayBuffer()));
  const response = await history(guest, ride.id);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const savedChat = await response.json();
  assert.equal(savedChat.messages.length, 3);
  assert.ok(savedChat.messages.some(m => m.senderUserId === guest.user.id));
  assert.deepEqual(savedChat.messages.map(m => m.id), savedChat.messages.map(m => m.id).sort((a,b) => BigInt(a) < BigInt(b) ? -1 : 1));
  await stop(); await start();
  // Rebind the client's existing session cookies to the restarted server's port.
  host.client = cookieClient(origin, host.client.jar);
  assert.deepEqual(await (await history(host, ride.id)).json(), savedChat);
});
test('chat: rejects anonymous, outsiders, former members, missing rides and spoofed sender fields', async () => {
  const host = await newActor(), guest = await newActor(), outside = await newActor(), ride = await newRide(host);
  const anonymous = { client: cookieClient(origin) };
  for (const [actor, status] of [[anonymous,401],[outside,403]]) {
    assert.equal((await history(actor, ride.id)).status, status);
    assert.equal((await message(actor, ride.id, { body: 'Forbidden' })).status, status);
  }
  for (const id of [randomUUID(), 'bad-id']) {
    assert.equal((await history(host, id)).status, 404);
    assert.equal((await message(host, id, { body: 'Missing' })).status, 404);
  }
  await operate(guest, ride.id, 'join');
  await operate(guest, ride.id, 'leave');
  assert.equal((await history(guest, ride.id)).status, 403);
  assert.equal((await message(guest, ride.id, { body: 'Left' })).status, 403);
  assert.equal((await message(host, ride.id, { body: 'Spoof', senderUserId: outside.user.id })).status, 400);
  for (const body of ['', ' \n\t ', 'x'.repeat(2001), 123, null]) {
    assert.equal((await message(host, ride.id, { body })).status, 400);
  }
  const crossOrigin = await fetch(origin + '/api/rides/' + ride.id + '/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: [...host.client.jar].map(([k,v]) => k + '=' + v).join('; ') }, body: JSON.stringify({body:'Blocked'}),
  });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual((await (await history(host, ride.id)).json()).messages, []);
  assert.equal((await message(host, ride.id, { body: 'x'.repeat(2000) })).status, 201);
});
test('chat: cancellation preserves history for members but prevents all new messages', async () => {
  const host = await newActor(), guest = await newActor(), outsider = await newActor(), ride = await newRide(host);
  await operate(guest, ride.id, 'join');
  const before = await (await message(guest, ride.id, { body: 'Saved history' })).json();
  await operate(host, ride.id, 'cancel');
  for (const actor of [host, guest]) {
    const chat = await (await history(actor, ride.id)).json();
    assert.ok(chat.cancelledAt);
    assert.deepEqual(chat.messages, before.messages);
    assert.equal((await message(actor, ride.id, { body: 'Too late' })).status, 409);
  }
  assert.equal((await history(outsider, ride.id)).status, 403);
  assert.equal((await db.query('SELECT count(*) FROM messages WHERE ride_id=$1', [ride.id])).rows[0].count, '1');
});
test('chat: a message waiting behind cancellation is rejected after the lock is released', async () => {
  const host = await newActor(), ride = await newRide(host), locker = await db.connect();
  let pending = Promise.resolve([]);
  try {
    await locker.query('BEGIN');
    await locker.query('UPDATE rides SET cancelled_at=clock_timestamp() WHERE id=$1', [ride.id]);
    pending = Promise.allSettled([(async () => {
      const response = await message(host, ride.id, { body: 'Racing cancellation' });
      await response.arrayBuffer();
      return response.status;
    })()]);
    let waiting = 0;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      waiting = Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT cancelled_at FROM rides WHERE id=%'")).rows[0].count);
      if (waiting === 1) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, 1);
    await locker.query('COMMIT');
  } finally {
    try { await locker.query('ROLLBACK'); }
    finally { locker.release(); await pending; }
  }
  const [result] = await pending;
  if (result.status === 'rejected') throw result.reason;
  assert.equal(result.value, 409);
  assert.equal((await db.query('SELECT count(*) FROM messages WHERE ride_id=$1', [ride.id])).rows[0].count, '0');
});
