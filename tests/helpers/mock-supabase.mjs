// Test-only HTTP provider. Production code has no mock login path or token bypass.
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
export const alice = { id: '10000000-0000-4000-8000-000000000001', email: 'Alice@BC.EDU', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { full_name: 'Alice Eagle' } };
export const bob = { ...alice, id: '10000000-0000-4000-8000-000000000002', email: 'bob@bc.edu', user_metadata: { full_name: 'Bob Eagle' } };
export async function mockSupabase(port = 0) {
  let selected = alice;
  const codes = new Map(), access = new Map(), refresh = new Map();
  const calls = [];
  const failures = new Map();
  function issue(user, sessionId = randomUUID()) {
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const access_token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: expires_at })).toString('base64url'), randomUUID()].join('.');
    const refresh_token = randomUUID();
    access.set(access_token, { user, sessionId }); refresh.set(refresh_token, { user, sessionId });
    return { access_token, refresh_token, expires_at, expires_in: 3600, token_type: 'bearer', user,
      provider_token: 'GOOGLE_ACCESS_MUST_NOT_PERSIST', provider_refresh_token: 'GOOGLE_REFRESH_MUST_NOT_PERSIST' };
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    calls.push({ path: url.pathname, search: url.search });
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (failures.has(url.pathname)) return json(failures.get(url.pathname), { message: 'Test provider unavailable' });
    let data = '';
    for await (const part of req) data += part;
    const body = data ? JSON.parse(data) : {};
    if (url.pathname === '/__test/select-user' && port === 3101) {
      selected = body.user === 'bob' ? bob : alice;
      return json(200, { selected: body.user === 'bob' ? 'bob' : 'alice' });
    }
    if (url.pathname === '/auth/v1/authorize') {
      const code = randomUUID();
      codes.set(code, { user: selected, challenge: url.searchParams.get('code_challenge') });
      const redirect = new URL(url.searchParams.get('redirect_to'));
      redirect.searchParams.set('code', code);
      res.writeHead(302, { Location: redirect.toString() }); res.end(); return;
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'pkce') {
        const code = codes.get(body.auth_code); codes.delete(body.auth_code);
        const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url');
        if (!code || challenge !== code.challenge) return json(400, { code: 'invalid_grant', message: 'Invalid PKCE code/verifier' });
        return json(200, issue(code.user));
      }
      const session = refresh.get(body.refresh_token);
      refresh.delete(body.refresh_token);
      if (!session) return json(400, { code: 'refresh_token_not_found', message: 'Invalid refresh token' });
      return json(200, issue(session.user, session.sessionId));
    }
    const token = req.headers.authorization?.replace(/^Bearer /i, '');
    const session = access.get(token);
    const user = session?.user;
    if (!user) return json(401, { code: 'bad_jwt', message: 'Invalid access token' });
    if (url.pathname === '/auth/v1/user') return json(200, user);
    if (url.pathname === '/auth/v1/logout') {
      for (const [key, value] of refresh) if (value.sessionId === session.sessionId) refresh.delete(key);
      res.writeHead(204); res.end(); return;
    }
    json(404, { message: 'Not found' });
  });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, select: user => { selected = user; }, calls, issue,
    fail: (path, status) => { if (status) failures.set(path, status); else failures.delete(path); },
    stop: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
export function cookieClient(origin, jar = new Map()) {
  async function request(path, init = {}) {
    const response = await fetch(new URL(path, origin), { ...init, redirect: 'manual', headers: {
      ...init.headers, Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '),
      ...(init.method === 'POST' ? { Origin: origin } : {}),
    } });
    for (const line of response.headers.getSetCookie()) {
      const [key, value] = line.split(';')[0].split('=');
      if (/Max-Age=0/i.test(line)) jar.delete(key); else jar.set(key, value);
    }
    return response;
  }
  async function login() {
    const start = await request('/api/auth/login', { method: 'POST' });
    if (start.status !== 200) throw new Error(`Login failed ${start.status}: ${await start.text()}`);
    const { url } = await start.json();
    const google = await fetch(url, { redirect: 'manual' });
    return request(google.headers.get('location'));
  }
  return { request, login, jar };
}
