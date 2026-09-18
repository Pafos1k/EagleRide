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
const environment = { ...process.env, APP_ORIGIN: 'http://localhost:3000', DATABASE_URL: databaseUrl, PORT: '0', GEMINI_API_KEY: '', API_KEY: '', GOOGLE_MAPS_ROUTES_API_KEY: '', DOTENV_CONFIG_PATH: 'tests/.env.disabled' };
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
  assert.deepEqual((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows.map(r => r.table_name), ['message_reactions', 'messages', 'reliability_ratings', 'reputation_memberships', 'ride_participants', 'ride_route_snapshots', 'rides', 'schema_migrations', 'users']);
  await migrate();
  assert.equal((await db.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '11');
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
  assert.deepEqual(Object.keys(user).sort(), ['avatarUrl', 'bcEmail', 'createdAt', 'fullName', 'id']);
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
  const cancelled = await newRide(host);
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
  const host = await newActor(), guest = await newActor(), ride = await newRide(host);
  await operate(guest, ride.id, 'join');
  const locker = await db.connect();
  let pending = Promise.resolve([]);
  try {
    await locker.query('BEGIN');
    await locker.query('UPDATE rides SET cancelled_at=clock_timestamp() WHERE id=$1', [ride.id]);
    pending = Promise.allSettled([(async () => {
      const response = await message(guest, ride.id, { body: 'Racing cancellation' });
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


test('routing availability never blocks persistence: unknown fare is nullable and survives restart', async () => {
  const host = await newActor();
  const ride = await newRide(host, { origin: { name: 'Unresolved custom pickup', address: null, terminal: null }, estimatedTotalCostCents: null });
  assert.equal(ride.estimatedTotalCostCents, null);
  await stop(); await start();
  const persisted = await (await fetch(origin + '/api/rides/' + ride.id)).json();
  assert.equal(persisted.estimatedTotalCostCents, null);
  assert.equal(persisted.origin.name, 'Unresolved custom pickup');
});


test('snapshot endpoint is ride-specific, optional, and has no arbitrary-location API', async () => {
  const host = await newActor(), ride = await newRide(host);
  const request = data => fetch(origin + '/api/rides/' + ride.id + '/route-snapshot', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  assert.equal((await request({ origin: input.origin })).status, 400);
  const first = await request({});
  assert.equal(first.status, 200);
  const snapshot = await first.json();
  assert.equal(snapshot.data, null);
  assert.equal(snapshot.latestRefreshFailed, true);
  assert.deepEqual(await (await request({})).json(), snapshot);
  assert.equal((await fetch(origin + '/api/routes', { method: 'POST' })).status, 404);
});

test('discovery excludes past, cancelled and full rides while preserving history', async () => {
  const host=await newActor(), guest=await newActor();
  const live=await newRide(host), past=await newRide(host,{departureTime:new Date(Date.now()-60000).toISOString()}), full=await newRide(host,{seatsTotal:2}), cancelled=await newRide(host);
  await operate(guest,full.id,'join');await operate(host,cancelled.id,'cancel');
  const discovery=await (await fetch(origin+'/api/rides')).json();
  assert.ok(discovery.some(r=>r.id===live.id));
  for(const ride of [past,full,cancelled]){
    assert.ok(!discovery.some(r=>r.id===ride.id));
    assert.equal((await fetch(origin+'/api/rides/'+ride.id)).status,200);
  }
  const activity=await (await host.client.request('/api/rides/mine')).json();
  for(const ride of [past,full,cancelled])assert.ok(activity.some(r=>r.id===ride.id));
});
test('profile updates only presentation, persists through identity sync, and chat joins current sender profile',async()=>{
  const host=await newActor(), guest=await newActor(), ride=await newRide(host);
  await operate(guest,ride.id,'join');
  const update=(client,body,headers={})=>client.request('/api/auth/profile',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)});
  const fields={fullName:'  Alex Rider  '};
  assert.equal((await update(cookieClient(origin),fields)).status,401);
  assert.equal((await update(host.client,fields,{Origin:'https://evil.example'})).status,403);
  for(const invalid of [{...fields,fullName:''},{...fields,fullName:'x'.repeat(81)},{...fields,fullName:'<script>'},{...fields,avatarUrl:'not a URL'},{...fields,avatarUrl:'javascript:alert(1)'},{...fields,avatarUrl:'http://example.com/a'},{...fields,avatarUrl:'https://user:secret@example.com/a'},{...fields,bcEmail:'fake@bc.edu'},{...fields,id:guest.user.id}])assert.equal((await update(host.client,invalid)).status,400);
  assert.equal((await update(host.client,fields)).status,200);
  const me=await (await host.client.request('/api/auth/me')).json();
  assert.equal(me.fullName,'Alex Rider');assert.equal(me.avatarUrl,null);assert.equal(me.id,host.user.id);assert.equal(me.bcEmail,host.user.bcEmail);
  assert.equal((await (await guest.client.request('/api/auth/me')).json()).fullName,guest.user.fullName);
  const sent=await host.client.request('/api/rides/'+ride.id+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Hello with identity'})});assert.equal(sent.status,201);
  let chat=await (await guest.client.request('/api/rides/'+ride.id+'/messages')).json();
  assert.equal(chat.messages[0].senderName,'Alex Rider');assert.equal(chat.messages[0].senderAvatarUrl,null);
  assert.equal((await update(host.client,{fullName:'Alex Updated'})).status,200);
  chat=await (await guest.client.request('/api/rides/'+ride.id+'/messages')).json();
  assert.equal(chat.messages[0].senderName,'Alex Updated');assert.equal(chat.messages[0].senderAvatarUrl,null);
  const row=(await db.query('SELECT display_name,avatar_url,auth_subject,bc_email FROM users WHERE id=$1',[host.user.id])).rows[0];
  assert.equal(row.display_name,'Alex Updated');assert.equal(row.bc_email,host.user.bcEmail);assert.ok(row.auth_subject);
});

test('avatar uploads use authenticated stable owner paths, reject invalid files and preserve profile on provider failure',async()=>{
  const owner=await newActor(),other=await newActor();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const upload=(client,body=png,type='image/png',extra={})=>client.request('/api/auth/profile/avatar',{method:'POST',headers:{Origin:origin,'Content-Type':type,...extra},body});
  assert.equal((await upload(cookieClient(origin))).status,401);
  assert.equal((await fetch(origin+'/api/auth/profile/avatar',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'image/png',Cookie:[...owner.client.jar].map(([k,v])=>k+'='+v).join('; ')},body:png})).status,403);
  assert.equal((await upload(owner.client,Buffer.from('<svg></svg>'),'image/svg+xml')).status,400);
  assert.equal((await upload(owner.client,Buffer.from('not an image'))).status,400);
  assert.equal((await upload(owner.client,Buffer.alloc(2097153))).status,413);
  const response=await upload(owner.client);assert.equal(response.status,200);
  const profile=await response.json();assert.equal(profile.id,owner.user.id);assert.equal(profile.bcEmail,owner.user.bcEmail);
  const subject=(await db.query('SELECT auth_subject FROM users WHERE id=$1',[owner.user.id])).rows[0].auth_subject;
  const path='/storage/v1/object/avatars/'+subject+'/avatar';
  assert.match(profile.avatarUrl,new RegExp('/public/avatars/'+subject+'/avatar\\?v='));
  assert.ok(provider.storedAvatars.get(path).equals(png));
  const count=provider.storedAvatars.size;assert.equal((await upload(owner.client)).status,200);assert.equal(provider.storedAvatars.size,count);
  assert.equal((await (await other.client.request('/api/auth/me')).json()).avatarUrl,null);
  const previous=await (await owner.client.request('/api/auth/me')).json();provider.fail(path,503);
  try{assert.equal((await upload(owner.client)).status,503);}finally{provider.fail(path,null);}
  assert.equal((await (await owner.client.request('/api/auth/me')).json()).avatarUrl,previous.avatarUrl);
  const ride=await newRide(owner);await operate(other,ride.id,'join');
  await owner.client.request('/api/rides/'+ride.id+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Photo identity'})});
  const chat=await (await other.client.request('/api/rides/'+ride.id+'/messages')).json();assert.equal(chat.messages[0].senderAvatarUrl,(await (await fetch(origin+'/api/users/'+owner.user.id)).json()).avatarUrl);
});

test('Now rides get a server-owned ten-minute grace window; expired rides stay out of discovery and joining',async()=>{
  const host=await newActor(),guest=await newActor();
  const now=await newRide(host,{departureMode:'now',departureTime:'2000-01-01T00:00:00Z'});
  const remaining=Date.parse(now.departureTime)-Date.now();assert.ok(remaining>590000 && remaining<=600000);
  assert.equal(now.departureMode,'now');
  assert.ok((await (await fetch(origin+'/api/rides')).json()).some(r=>r.id===now.id));
  assert.equal((await operate(guest,now.id,'join')).status,200);
  assert.equal((await (await host.client.request('/api/rides/mine')).json()).find(r=>r.id===now.id).category,'upcoming');
  await db.query("UPDATE rides SET departure_at=clock_timestamp()-interval '1 second' WHERE id=$1",[now.id]);
  assert.ok(!(await (await fetch(origin+'/api/rides')).json()).some(r=>r.id===now.id));
  const late=await newActor();assert.equal((await operate(late,now.id,'join')).status,409);
  assert.equal((await (await host.client.request('/api/rides/mine')).json()).find(r=>r.id===now.id).category,'past');
  const scheduled=await newRide(host,{departureTime:'2000-01-01T00:00:00Z'});assert.equal(scheduled.departureTime,'2000-01-01T00:00:00.000Z');
});
test('search matches normalized stored locations and exact departure bounds without exposing full/past rides',async()=>{
  const host=await newActor();const base=new Date(Date.now()+86400000);base.setUTCHours(12,0,0,0);
  const match=await newRide(host,{origin:{name:'Search Campus',address:'1 Search Road',terminal:null},destination:{name:'Search Station',address:null,terminal:null},departureTime:base.toISOString()});
  const wrong=await newRide(host,{origin:{name:'Different Campus'},destination:{name:'Search Station'},departureTime:base.toISOString()});
  const params=new URLSearchParams({from:'  SEARCH   CAMPUS ',to:'Search Station',after:base.toISOString(),before:new Date(+base+3600000).toISOString()});
  const results=await (await fetch(origin+'/api/rides?'+params)).json();assert.deepEqual(results.map(r=>r.id),[match.id]);assert.ok(!results.some(r=>r.id===wrong.id));
  params.set('from','1 Search Road');assert.equal((await (await fetch(origin+'/api/rides?'+params)).json())[0].id,match.id);
  params.set('before',base.toISOString());assert.equal((await fetch(origin+'/api/rides?'+params)).status,400);
  assert.equal((await fetch(origin+'/api/rides?after=invalid')).status,400);
});
test('realtime chat events, idempotent sends, author deletion, and persisted reactions enforce membership',async()=>{
  const host=await newActor(),guest=await newActor(),outsider=await newActor(),ride=await newRide(host);
  await operate(guest,ride.id,'join');
  assert.equal((await outsider.client.request('/api/rides/'+ride.id+'/events')).status,403);
  const abort=new AbortController();const response=await guest.client.request('/api/rides/'+ride.id+'/events',{signal:abort.signal});assert.equal(response.status,200);
  const reader=response.body.getReader();let buffer='';
  const next=async label=>{
    const deadline=setTimeout(()=>abort.abort(),5000);
    try{while(!buffer.includes(label)){const part=await reader.read();if(part.done)assert.fail('Event stream closed before '+label);buffer+=new TextDecoder().decode(part.value);}buffer='';}finally{clearTimeout(deadline);}
  };
  try{
    await next('event: changed');
    const key=randomUUID();const send=()=>host.client.request('/api/rides/'+ride.id+'/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Realtime durable message',clientMessageId:key})});
    const first=await(await send()).json();await next('event: changed');await send();
    let history=await(await guest.client.request('/api/rides/'+ride.id+'/messages')).json();assert.equal(history.messages.length,1);
    const messageId=history.messages[0].id;
    const react=(who,method)=>who.client.request('/api/rides/'+ride.id+'/messages/'+messageId+'/reactions',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({emoji:'👍'})});
    assert.equal((await react(outsider,'PUT')).status,403);assert.equal((await react(guest,'PUT')).status,200);await next('event: changed');await react(guest,'PUT');
    history=await(await host.client.request('/api/rides/'+ride.id+'/messages')).json();assert.equal(history.messages[0].reactions.length,1);assert.ok(BigInt(history.revision)>BigInt(first.revision));
    const changed=await guest.client.request('/api/rides/'+ride.id+'/messages/'+messageId+'/reactions',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({emoji:'😢'})});assert.equal(changed.status,200);await changed.arrayBuffer();await next('event: changed');
    assert.deepEqual((await(await guest.client.request('/api/rides/'+ride.id+'/messages')).json()).messages[0].reactions,[{userId:guest.user.id,emoji:'😢'}]);
    const remove=who=>who.client.request('/api/rides/'+ride.id+'/messages/'+messageId,{method:'DELETE',headers:{Origin:origin}});
    assert.equal((await remove(guest)).status,403);assert.equal((await remove(host)).status,200);await next('event: changed');
    assert.equal((await(await guest.client.request('/api/rides/'+ride.id+'/messages')).json()).messages.length,0);
    await operate(guest,ride.id,'leave');await next('event: forbidden');
  }finally{abort.abort();await reader.cancel().catch(()=>{});}
});

test('reactions survive restart, remove idempotently, and cancelled chat mutations fail closed',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);await operate(guest,ride.id,'join');
  const sent=await(await message(host,ride.id,{body:'Persistent reaction'})).json();const id=sent.messages[0].id;
  const react=(method,emoji='👍')=>guest.client.request('/api/rides/'+ride.id+'/messages/'+id+'/reactions',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({emoji})});
  assert.equal((await react('PUT','not-an-emoji')).status,400);assert.equal((await react('PUT')).status,200);
  const saved=await(await history(guest,ride.id)).json();
  await stop();await start();host.client=cookieClient(origin,host.client.jar);guest.client=cookieClient(origin,guest.client.jar);
  assert.deepEqual(await(await history(guest,ride.id)).json(),saved);
  assert.equal((await react('DELETE')).status,200);assert.equal((await react('DELETE')).status,200);
  assert.deepEqual((await(await history(guest,ride.id)).json()).messages[0].reactions,[]);
  await operate(host,ride.id,'cancel');assert.equal((await react('PUT')).status,409);
  assert.equal((await host.client.request('/api/rides/'+ride.id+'/messages/'+id,{method:'DELETE',headers:{Origin:origin}})).status,409);
  assert.equal((await(await history(host,ride.id)).json()).messages.length,1);
});

test('reactions: one per user, replacement, removal, concurrent writes and direct database protection',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);await operate(guest,ride.id,'join');
  const sent=await(await message(host,ride.id,{body:'Single reaction'})).json(),id=sent.messages[0].id;
  const react=(who,emoji,method='PUT')=>who.client.request('/api/rides/'+ride.id+'/messages/'+id+'/reactions',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({emoji})});
  assert.equal((await react(host,'❤️')).status,200);assert.equal((await react(guest,'❤️')).status,200);
  let chat=await(await history(host,ride.id)).json();assert.equal(chat.messages[0].reactions.filter(r=>r.emoji==='❤️').length,2);
  const revision=chat.revision;
  assert.equal((await react(host,'😮')).status,200);
  chat=await(await history(host,ride.id)).json();assert.ok(BigInt(chat.revision)>BigInt(revision));
  assert.deepEqual(chat.messages[0].reactions.filter(r=>r.userId===host.user.id),[{userId:host.user.id,emoji:'😮'}]);
  await react(host,'❤️','DELETE'); // A stale removal must not remove the new choice.
  assert.equal((await(await history(host,ride.id)).json()).messages[0].reactions.length,2);
  await react(host,'😮','DELETE');assert.equal((await(await history(host,ride.id)).json()).messages[0].reactions.length,1);
  const results=await Promise.allSettled(['👍','😂','😢'].map(async emoji=>{const response=await react(host,emoji);await response.arrayBuffer();return response.status;}));
  assert.ok(results.every(r=>r.status==='fulfilled' && r.value===200));
  const rows=(await db.query('SELECT emoji FROM message_reactions WHERE message_id=$1 AND user_id=$2',[id,host.user.id])).rows;
  assert.equal(rows.length,1);
  await assert.rejects(db.query('INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3)',[id,host.user.id,'❤️']),error=>error.code==='23505');
});

test('reactions: migration safely consolidates legacy stacked reactions',async()=>{
  const host=await newActor(),ride=await newRide(host);
  const id=(await(await message(host,ride.id,{body:'Legacy reactions'})).json()).messages[0].id;
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await client.query('ALTER TABLE message_reactions DROP CONSTRAINT message_reactions_pkey');
    await client.query('ALTER TABLE message_reactions ADD PRIMARY KEY(message_id,user_id,emoji)');
    await client.query("INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,'❤️'),($1,$2,'👍')",[id,host.user.id]);
    const {readFile}=await import('node:fs/promises');
    await client.query(await readFile(new URL('../server/migrations/009_single_reaction.sql',import.meta.url),'utf8'));
    assert.equal((await client.query('SELECT count(*) FROM message_reactions WHERE message_id=$1',[id])).rows[0].count,'1');
    assert.equal((await client.query('SELECT count(*) FROM messages WHERE id=$1',[id])).rows[0].count,'1');
  }finally{await client.query('ROLLBACK');client.release();}
});

test('search: disjoint windows use OR without including the afternoon gap and retain capacity rules',async()=>{
  const host=await newActor(),day=new Date(Date.now()+86400000);day.setUTCHours(0,0,0,0);
  const time=hour=>new Date(+day+hour*3600000).toISOString(),location='Window search '+randomUUID();
  const rides=[];for(const hour of [8,14,19])rides.push(await newRide(host,{origin:{name:location},departureTime:time(hour)}));
  const full=await newRide(host,{origin:{name:location},departureTime:time(8),seatsTotal:1});
  const params=new URLSearchParams({from:location,windows:JSON.stringify([{after:time(6),before:time(12)},{after:time(17),before:time(24)}])});
  const result=await(await fetch(origin+'/api/rides?'+params)).json();assert.deepEqual(result.map(r=>r.id),[rides[0].id,rides[2].id]);assert.ok(!result.some(r=>r.id===full.id));
  params.set('windows','not-json');assert.equal((await fetch(origin+'/api/rides?'+params)).status,400);
  params.set('windows',JSON.stringify([{after:time(17),before:time(6)}]));assert.equal((await fetch(origin+'/api/rides?'+params)).status,400);
});
test('search: nearby campus opt-in works at either endpoint without rewriting actual locations',async()=>{
  const host=await newActor(),airport='Campus search '+randomUUID();
  const main=await newRide(host,{origin:{name:'Boston College',address:'140 Commonwealth Ave, Chestnut Hill, MA'},destination:{name:airport}});
  const newton=await newRide(host,{origin:{name:'Newton Campus',address:'885 Centre St, Newton, MA'},destination:{name:airport}});
  const run=async query=>(await(await fetch(origin+'/api/rides?'+new URLSearchParams(query))).json());
  assert.deepEqual((await run({from:'Newton Campus',to:airport})).map(r=>r.id),[newton.id]);
  const expanded=await run({from:'Newton Campus',to:airport,nearbyCampuses:'true'});
  assert.deepEqual(new Set(expanded.map(r=>r.id)),new Set([main.id,newton.id]));
  assert.equal(expanded.find(r=>r.id===main.id).origin.name,'Boston College');assert.equal(expanded.find(r=>r.id===newton.id).origin.name,'Newton Campus');
  assert.deepEqual(new Set((await run({from:'Boston College Main Campus',to:airport,nearbyCampuses:'true'})).map(r=>r.id)),new Set([main.id,newton.id]));
  const reverseMain=await newRide(host,{origin:{name:airport},destination:{name:'Boston College'}}),reverseNewton=await newRide(host,{origin:{name:airport},destination:{name:'Newton Campus'}});
  assert.deepEqual(new Set((await run({from:airport,to:'Newton Campus',nearbyCampuses:'true'})).map(r=>r.id)),new Set([reverseMain.id,reverseNewton.id]));
  assert.deepEqual((await run({from:'Unrecognized campus',to:airport,nearbyCampuses:'true'})),[]);
});

const rate = (actor,ride,recipient,outcome='reliable',reason,extra={}) => actor.client.request(`/api/rides/${ride.id}/ratings`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipientUserId:recipient.user.id,outcome,...(reason?{reason}:{}),...extra})});
const ratings = async (actor,ride) => { const response=await actor.client.request(`/api/rides/${ride.id}/ratings`);assert.equal(response.status,200);return response.json(); };
const profile = async actor => {const response=await fetch(origin+'/api/users/'+actor.user.id);assert.equal(response.status,200);return response.json();};
async function pastMemberships(ride) {
  // Advance a real joined ride's clock fixture; production eligibility uses DB wall time.
  await db.query("UPDATE rides SET departure_at=clock_timestamp()-interval '1 minute' WHERE id=$1",[ride.id]);
  await db.query("UPDATE ride_participants SET joined_at=(SELECT departure_at-interval '1 day' FROM rides WHERE id=$1) WHERE ride_id=$1",[ride.id]);
}
async function ratingTrip() {
  const host=await newActor(),guest=await newActor(),other=await newActor();const ride=await newRide(host);
  assert.equal((await operate(guest,ride.id,'join')).status,200);assert.equal((await operate(other,ride.id,'join')).status,200);
  await pastMemberships(ride);return {host,guest,other,ride};
}
test('reputation: reliable, no-show and significantly late outcomes use authenticated participants, including host',async()=>{
  const {host,guest,other,ride}=await ratingTrip();
  assert.equal((await rate(host,ride,guest)).status,200);
  assert.equal((await rate(guest,ride,host,'issue','no_show')).status,200);
  assert.equal((await rate(other,ride,guest,'issue','significantly_late')).status,200);
  const state=await ratings(host,ride);assert.equal(state.recipients.find(p=>p.profile.id===guest.user.id).rating.outcome,'reliable');
  const reputation=(await profile(guest)).reputation;
  assert.equal(reputation.ratingCount,2);assert.equal(reputation.reliableCount,1);assert.equal(reputation.issueCount,1);assert.equal(reputation.reliabilityPercent,null);assert.equal(reputation.rideCount,1);
});
test('reputation: exact two-hour boundary and late leavers only permit late cancellation; early leavers excluded',async()=>{
  const {host,guest,other,ride}=await ratingTrip();
  await db.query("UPDATE ride_participants SET left_at=(SELECT departure_at-interval '2 hours' FROM rides WHERE id=$1) WHERE ride_id=$1 AND user_id=$2",[ride.id,guest.user.id]);
  await db.query("UPDATE ride_participants SET left_at=(SELECT departure_at-interval '2 hours 1 second' FROM rides WHERE id=$1) WHERE ride_id=$1 AND user_id=$2",[ride.id,other.user.id]);
  const state=await ratings(host,ride);assert.equal(state.recipients.length,1);assert.equal(state.recipients[0].eligibility,'late_cancellation');
  for(const [outcome,reason] of [['reliable',undefined],['issue','no_show'],['issue','significantly_late']])assert.equal((await rate(host,ride,guest,outcome,reason)).status,400);
  assert.equal((await rate(host,ride,guest,'issue','late_cancellation')).status,200);
  assert.equal((await rate(host,ride,other,'issue','late_cancellation')).status,403);
  assert.equal((await rate(guest,ride,host)).status,403);
  const history=await (await guest.client.request('/api/rides/mine')).json();assert.ok(history.some(r=>r.id===ride.id&&!r.canRate));
  const early=await (await other.client.request('/api/rides/mine')).json();assert.ok(!early.some(r=>r.id===ride.id));
});
test('reputation: leaving inside two hours and after departure retains correct historical eligibility',async()=>{
  const {host,guest,other,ride}=await ratingTrip();
  await db.query("UPDATE ride_participants SET left_at=(SELECT departure_at-interval '30 minutes' FROM rides WHERE id=$1) WHERE ride_id=$1 AND user_id=$2",[ride.id,other.user.id]);
  assert.equal((await operate(guest,ride.id,'leave')).status,200);
  const state=await ratings(host,ride);assert.equal(state.recipients.find(p=>p.profile.id===guest.user.id).eligibility,'joined');
  assert.equal((await rate(host,ride,guest,'issue','late_cancellation')).status,400);
  assert.equal((await rate(host,ride,guest)).status,200);
  assert.equal((await rate(guest,ride,host)).status,200);
  assert.equal((await rate(guest,ride,other,'issue','late_cancellation')).status,200);
  const activity=await (await guest.client.request('/api/rides/mine')).json();assert.ok(activity.some(r=>r.id===ride.id&&r.category==='past'&&r.canRate&&r.ratingsRemaining===0));
});
test('reputation: future/cancelled rides cannot be rated and post-departure cancellation is rejected',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);
  await operate(guest,ride.id,'join');
  assert.equal((await ratings(host,ride)).canRate,false);assert.equal((await rate(host,ride,guest)).status,403);
  assert.equal((await operate(host,ride.id,'cancel')).status,200);await pastMemberships(ride);
  assert.equal((await ratings(host,ride)).canRate,false);assert.equal((await rate(host,ride,guest)).status,403);
  const live=await newRide(host);await operate(guest,live.id,'join');await pastMemberships(live);
  assert.equal((await operate(host,live.id,'cancel')).status,409);
  assert.equal((await db.query('SELECT cancelled_at FROM rides WHERE id=$1',[live.id])).rows[0].cancelled_at,null);
  assert.equal((await rate(host,live,guest)).status,200);
});
test('reputation: anonymous, outsider, self, spoofed identity and invalid outcome/reason rejected',async()=>{
  const {host,guest,ride}=await ratingTrip(),outside=await newActor();
  assert.equal((await rate({client:cookieClient(origin)},ride,guest)).status,401);
  assert.equal((await rate(outside,ride,guest)).status,403);assert.equal((await rate(host,ride,outside)).status,403);
  assert.equal((await rate(host,ride,host)).status,400);
  assert.equal((await rate(host,ride,guest,'reliable',undefined,{raterUserId:outside.user.id})).status,400);
  for(const body of [{outcome:'bad'},{outcome:'issue'},{outcome:'issue',reason:'bad'},{outcome:'reliable',reason:'no_show'},{score:100}])assert.equal((await rate(host,ride,guest,'reliable',undefined,body)).status,400);
  const rejected=await fetch(origin+`/api/rides/${ride.id}/ratings`,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json',Cookie:[...host.client.jar].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify({recipientUserId:guest.user.id,outcome:'reliable'})});assert.equal(rejected.status,403);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reliability_ratings WHERE ride_id=$1',[ride.id])).rows[0].n,0);
});
test('reputation: concurrent identical retries are idempotent, conflicts immutable and DB constraints enforced',async()=>{
  const {host,guest,other,ride}=await ratingTrip();
  const concurrent=await Promise.allSettled([rate(host,ride,guest),rate(host,ride,guest)]);
  for(const result of concurrent){assert.equal(result.status,'fulfilled');assert.equal(result.value.status,200);}
  assert.equal((await rate(host,ride,guest,'issue','no_show')).status,409);
  const conflict=await Promise.allSettled([rate(other,ride,host),rate(other,ride,host,'issue','no_show')]);
  assert.deepEqual(conflict.map(r=>{assert.equal(r.status,'fulfilled');return r.value.status;}).sort(),[200,409]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reliability_ratings WHERE ride_id=$1',[ride.id])).rows[0].n,2);
  await assert.rejects(db.query("UPDATE reliability_ratings SET outcome='issue',reason='no_show' WHERE ride_id=$1",[ride.id]),/immutable/);
  await assert.rejects(db.query('DELETE FROM reliability_ratings WHERE ride_id=$1',[ride.id]),/immutable/);
  const insert=(rater,recipient,outcome,reason)=>db.query('INSERT INTO reliability_ratings(ride_id,rater_user_id,recipient_user_id,outcome,reason) VALUES($1,$2,$3,$4,$5)',[ride.id,rater,recipient,outcome,reason]);
  await assert.rejects(insert(host.user.id,host.user.id,'reliable',null),e=>e.code==='23514');
  await assert.rejects(insert(host.user.id,other.user.id,'issue',null),e=>e.code==='23514');
  await assert.rejects(insert(host.user.id,'missing','reliable',null),e=>e.code==='23503');
});
test('reputation: submission window closes after seven days but identical retries remain successful',async()=>{
  const {host,guest,other,ride}=await ratingTrip();assert.equal((await rate(host,ride,guest)).status,200);
  await db.query("UPDATE rides SET departure_at=clock_timestamp()-interval '8 days' WHERE id=$1",[ride.id]);
  await db.query("UPDATE ride_participants SET joined_at=clock_timestamp()-interval '9 days' WHERE ride_id=$1",[ride.id]);
  assert.equal((await ratings(host,ride)).canRate,false);
  assert.equal((await rate(host,ride,guest)).status,200);assert.equal((await rate(host,ride,other)).status,409);
});
test('reputation: threshold requires two distinct rides and two independent raters',async()=>{
  const host=await newActor(),a=await newActor(),b=await newActor(),c=await newActor();
  const trip=async people=>{const ride=await newRide(host);for(const person of people)await operate(person,ride.id,'join');await pastMemberships(ride);return ride;};
  const first=await trip([a,b,c]);
  assert.equal((await rate(a,first,host)).status,200);
  assert.equal((await profile(host)).reputation.reliabilityPercent,null); // one ride / one rater
  for(const person of [b,c])assert.equal((await rate(person,first,host)).status,200);
  assert.equal((await profile(host)).reputation.reliabilityPercent,null); // three raters but one ride
  const second=await trip([a]);await rate(a,second,host);
  assert.equal((await profile(host)).reputation.reliabilityPercent,100);
  const third=await trip([a]);await rate(a,third,host,'issue','no_show');
  const rep=(await profile(host)).reputation;assert.equal(rep.reliabilityPercent,80);assert.equal(rep.ratingCount,5);assert.equal(rep.rideCount,3);assert.equal(rep.distinctRaterCount,3);
  const target=await newActor();
  for(const [i,rater] of [a,b].entries()){
    const ride=await newRide(target);await operate(rater,ride.id,'join');await pastMemberships(ride);
    assert.equal((await rate(rater,ride,target,i?'issue':'reliable',i?'no_show':undefined)).status,200);
    const result=(await profile(target)).reputation;
    assert.equal(result.reliabilityPercent,i?50:null);
    assert.equal(result.distinctRideCount,i+1);assert.equal(result.distinctRaterCount,i+1);
  }
  const future=await newRide(target);
  const detail=await (await fetch(origin+'/api/rides/'+future.id)).json();
  assert.equal(detail.participants.find(p=>p.userId===target.user.id).profile.reputation.reliabilityPercent,50);
  const solo=await newActor();for(let i=0;i<3;i++){const ride=await newRide(solo);await operate(a,ride.id,'join');await pastMemberships(ride);await rate(a,ride,solo);}
  const limited=(await profile(solo)).reputation;assert.equal(limited.ratingCount,3);assert.equal(limited.distinctRideCount,3);assert.equal(limited.distinctRaterCount,1);assert.equal(limited.reliabilityPercent,null);
});
test('reputation: public profiles/detail/chat allowlist identity; avatar proxy hides provider IDs and private fields',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);await operate(guest,ride.id,'join');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  assert.equal((await host.client.request('/api/auth/profile/avatar',{method:'POST',headers:{'Content-Type':'image/png'},body:png})).status,200);
  const value=await profile(host),row=(await db.query('SELECT auth_subject FROM users WHERE id=$1',[host.user.id])).rows[0];
  assert.deepEqual(Object.keys(value).sort(),['avatarUrl','fullName','id','reputation']);
  assert.match(value.avatarUrl,new RegExp(`^/api/users/${host.user.id}/avatar\\?v=[a-f0-9]{24}$`));
  assert.ok(!JSON.stringify(value).includes(host.user.bcEmail));assert.ok(!JSON.stringify(value).includes(row.auth_subject));
  const avatar=await fetch(origin+value.avatarUrl);assert.equal(avatar.status,200);assert.equal(avatar.headers.get('location'),null);assert.deepEqual(Buffer.from(await avatar.arrayBuffer()),png);
  const detail=await (await fetch(origin+'/api/rides/'+ride.id)).json();assert.deepEqual(detail.participants.find(p=>p.userId===host.user.id).profile,value);
  await message(host,ride.id,{body:'Public-safe identity'});const chat=await (await guest.client.request('/api/rides/'+ride.id+'/messages')).json();assert.equal(chat.messages[0].senderAvatarUrl,value.avatarUrl);
  assert.ok(!JSON.stringify(detail).includes(row.auth_subject));assert.ok(!JSON.stringify(chat).includes(row.auth_subject));
  const own=await (await host.client.request('/api/auth/me')).json();assert.equal(own.bcEmail,host.user.bcEmail);
  assert.equal((await fetch(origin+'/api/users/missing')).status,404);
  await db.query("UPDATE users SET avatar_url='https://example.com/arbitrary' WHERE id=$1",[host.user.id]);
  assert.equal((await fetch(origin+value.avatarUrl)).status,404);
});

test('reputation: current state after a rejoin governs departure eligibility and ratings survive server restart',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);
  await operate(guest,ride.id,'join');await operate(guest,ride.id,'leave');await operate(guest,ride.id,'join');
  await pastMemberships(ride);assert.equal((await ratings(host,ride)).recipients[0].eligibility,'joined');
  assert.equal((await rate(host,ride,guest)).status,200);
  const before=await profile(guest);
  await stop();await start();host.client=cookieClient(origin,host.client.jar);
  assert.equal((await ratings(host,ride)).recipients[0].rating.outcome,'reliable');
  assert.deepEqual(await profile(guest),before);
});

test('reputation: replacing an avatar changes its safe public/chat URL without exposing the storage identity',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);
  await operate(guest,ride.id,'join');
  await message(host,ride.id,{body:'Avatar version regression'});
  const subject=(await db.query('SELECT auth_subject FROM users WHERE id=$1',[host.user.id])).rows[0].auth_subject;
  const storage=`${provider.url}/storage/v1/object/public/avatars/${subject}/avatar`;
  await db.query('UPDATE users SET avatar_url=$1 WHERE id=$2',[storage+'?v=1',host.user.id]);
  const before=await profile(host);
  await db.query('UPDATE users SET avatar_url=$1 WHERE id=$2',[storage+'?v=2',host.user.id]);
  const after=await profile(host);
  assert.notEqual(after.avatarUrl,before.avatarUrl,'A new photo must invalidate the mounted image URL/failure state');
  assert.equal((await profile(host)).avatarUrl,after.avatarUrl,'Unchanged photos must reuse their URL');
  const chat=await (await guest.client.request(`/api/rides/${ride.id}/messages`)).json();
  assert.equal(chat.messages[0].senderAvatarUrl,after.avatarUrl);
  for(const value of [before,after,chat]) {assert.ok(!JSON.stringify(value).includes(subject));assert.ok(!JSON.stringify(value).includes(storage));}
});

test('reputation: cancellation uses database time after waiting for the ride lock',async()=>{
  const host=await newActor(),ride=await newRide(host),locker=await db.connect();
  let pending;
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM rides WHERE id=$1 FOR UPDATE',[ride.id]);
    pending=Promise.allSettled([operate(host,ride.id,'cancel')]);
    let waiting=0;
    for(let i=0;i<100&&!waiting;i++){
      waiting=Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM rides WHERE id=%'")).rows[0].count);
      if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(waiting,'cancellation must wait on the membership/ride lock');
    // Move the departure fixture across the deadline while the request waits.
    await locker.query("UPDATE rides SET departure_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ride.id]);
    await locker.query('COMMIT');
    const [result]=await pending;assert.equal(result.status,'fulfilled');assert.equal(result.value.status,409);
    assert.equal((await db.query('SELECT cancelled_at FROM rides WHERE id=$1',[ride.id])).rows[0].cancelled_at,null);
    const upcoming=await newRide(host);assert.equal((await operate(host,upcoming.id,'cancel')).status,200);
    assert.equal((await db.query('SELECT cancelled_at<departure_at AS before FROM rides WHERE id=$1',[upcoming.id])).rows[0].before,true);
  } finally {
    await locker.query('ROLLBACK');locker.release();
    if(pending)await pending;
  }
});

async function rideStream(id) {
  const abort=new AbortController();
  const response=await fetch(origin+`/api/rides/${id}/ride-events`,{signal:abort.signal});
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type')?.split(';')[0],'text/event-stream');
  const reader=response.body.getReader();let buffer='';
  return {
    async next(){
      const deadline=setTimeout(()=>abort.abort(),5000);
      try {
        while(!buffer.includes('\n\n')){const part=await reader.read();assert.ok(!part.done,'stream closed');buffer+=new TextDecoder().decode(part.value);}
        const end=buffer.indexOf('\n\n');const event=buffer.slice(0,end);buffer=buffer.slice(end+2);return event;
      } finally{clearTimeout(deadline);}
    },
    async close(){abort.abort();await reader.cancel().catch(()=>{});}
  };
}
test('ride realtime: anonymous viewers resync public membership and reputation on join, leave, cancellation and reconnect',async()=>{
  const host=await newActor(),guest=await newActor(),ride=await newRide(host);
  await db.query("UPDATE users SET display_name='Visible participant' WHERE id=$1",[guest.user.id]);
  let stream=await rideStream(ride.id);
  const changed='event: changed\ndata: {}';
  try{
    assert.equal(await stream.next(),changed);
    assert.equal((await operate(guest,ride.id,'join')).status,200);assert.equal(await stream.next(),changed);
    let detail=await(await fetch(origin+'/api/rides/'+ride.id)).json();assert.equal(detail.seatsTaken,2);
    const member=detail.participants.find(p=>p.userId===guest.user.id);assert.equal(member.profile.fullName,'Visible participant');assert.equal(member.profile.reputation.reliabilityPercent,null);assert.ok(!('bcEmail' in member.profile));
    assert.equal((await operate(guest,ride.id,'leave')).status,200);assert.equal(await stream.next(),changed);
    detail=await(await fetch(origin+'/api/rides/'+ride.id)).json();assert.equal(detail.seatsTaken,1);assert.equal(detail.participants.filter(p=>!p.leftAt).length,1);
    await stream.close();await operate(guest,ride.id,'join'); // deliberately missed notification
    stream=await rideStream(ride.id);assert.equal(await stream.next(),changed);
    assert.equal((await(await fetch(origin+'/api/rides/'+ride.id)).json()).seatsTaken,2);
    await operate(host,ride.id,'cancel');assert.equal(await stream.next(),changed);
    assert.ok((await(await fetch(origin+'/api/rides/'+ride.id)).json()).cancelledAt);
  }finally{await stream.close();}
  assert.equal((await fetch(origin+'/api/rides/'+randomUUID()+'/ride-events')).status,404);
  assert.equal((await fetch(origin+'/api/rides/invalid/ride-events')).status,404);
});
test('ride realtime: notifications are commit-only and scoped to the requested ride, separate from chat',async()=>{
  const host=await newActor(),ride=await newRide(host),other=await newRide(host),guest=await newActor();
  const stream=await rideStream(ride.id),listener=new pg.Client({connectionString:databaseUrl});
  const notices=[];await listener.connect();await listener.query('LISTEN ride_state');listener.on('notification',event=>notices.push(event.payload));
  const client=await db.connect();
  try{
    await stream.next();
    await client.query('BEGIN');await client.query('INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)',[ride.id,guest.user.id]);await client.query('ROLLBACK');
    await message(host,ride.id,{body:'Private chat activity'});
    await operate(guest,other.id,'join');
    // A listener round trip drains earlier notifications without arbitrary sleeps.
    await listener.query('SELECT 1');assert.deepEqual(notices,[other.id]);
    await operate(guest,ride.id,'join');
    assert.equal(await stream.next(),'event: changed\ndata: {}');
    await listener.query('SELECT 1');assert.deepEqual(notices,[other.id,ride.id]);
  }finally{await client.query('ROLLBACK');client.release();await stream.close();await listener.end();}
});
