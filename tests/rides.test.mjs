import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';

// Always create/drop a uniquely named disposable DB, never reset a supplied DB.
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a PostgreSQL connection with CREATEDB permission.');
const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
const databaseName = `eagleride_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.pathname = `/${databaseName}`;
const databaseUrl = url.toString();
const db = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
let databaseCreated = false;
let server;
let origin;
let saved;
const environment = { ...process.env, DATABASE_URL: databaseUrl, PORT: '0', GEMINI_API_KEY: '', API_KEY: '', DOTENV_CONFIG_PATH: 'tests/.env.disabled' };
async function migrate() {
  const child = spawn(process.execPath, ['dist/server/migrate.mjs'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, errors);
}
async function start() {
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
const post = body => fetch(`${origin}/api/rides`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const count = async () => Number((await db.query('SELECT count(*) FROM rides')).rows[0].count);
before(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  await migrate();
  await start();
}, { timeout: 30000 });
after(async () => {
  await stop();
  await db.end();
  if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

test('migrations work on an empty database and are repeatable', async () => {
  assert.equal(await count(), 0);
  assert.deepEqual((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows.map(r => r.table_name), ['ride_participants', 'rides', 'schema_migrations', 'users']);
  await migrate();
  assert.equal((await db.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '1');
  assert.equal((await db.query("SELECT full_name FROM users WHERE id='u1'")).rows[0].full_name, 'Baldwin Eagle');
});
test('POST creates a persisted ride and host participation with server identity and timestamps', async () => {
  const response = await post(input);
  assert.equal(response.status, 201);
  saved = await response.json();
  assert.equal(response.headers.get('location'), `/api/rides/${saved.id}`);
  assert.equal(saved.hostUserId, 'u1');
  assert.equal(saved.seatsTaken, 1);
  assert.equal(saved.estimatedTotalCostCents, 5432);
  assert.ok(Number.isFinite(Date.parse(saved.createdAt)));
  const parts = (await db.query('SELECT * FROM ride_participants WHERE ride_id=$1', [saved.id])).rows;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].user_id, 'u1');
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
  const response = await fetch(`${origin}/api/rides/${saved.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), saved);
});
test('unique participation, foreign keys, and capacity constraints are enforced by PostgreSQL', async () => {
  await assert.rejects(db.query('INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)', [saved.id, 'u1']), { code: '23505' });
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
    const response = await fetch(`${origin}/api/rides`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});
