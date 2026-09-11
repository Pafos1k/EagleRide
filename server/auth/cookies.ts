import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';

const SESSION = 'er-auth';
const PKCE = 'er-pkce';
const CHUNK_SIZE = 2800;
const MAX_CHUNKS = 6;
export interface SessionTokens { access_token: string; refresh_token: string; expires_at: number }
export function authCookies(req: Request, res: Response, secure: boolean) {
  const jar = { ...parseCookie(req.headers.cookie ?? '') };
  const options = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  function put(name: string, value: string, maxAge: number) {
    jar[name] = value;
    res.append('Set-Cookie', stringifySetCookie({ name, value, ...options, maxAge }));
  }
  function clear(name: string) {
    for (let i = 0; i < MAX_CHUNKS; i++) if (jar[`${name}.${i}`] !== undefined) put(`${name}.${i}`, '', 0);
  }
  function read(name: string): unknown {
    try {
      let value = '';
      for (let i = 0; i < MAX_CHUNKS && jar[`${name}.${i}`]; i++) value += jar[`${name}.${i}`];
      return value ? JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) : null;
    } catch { return null; }
  }
  function write(name: string, value: unknown, maxAge: number) {
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
    if (encoded.length > CHUNK_SIZE * MAX_CHUNKS) throw new Error('Authentication cookie exceeds size limit');
    clear(name);
    for (let i = 0; i * CHUNK_SIZE < encoded.length; i++) put(`${name}.${i}`, encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), maxAge);
  }
  function session(): SessionTokens | null {
    const value = read(SESSION) as Partial<SessionTokens> | null;
    return value && typeof value.access_token === 'string' && typeof value.refresh_token === 'string'
      && typeof value.expires_at === 'number' && Number.isFinite(value.expires_at) ? value as SessionTokens : null;
  }
  const savedPkce = read(PKCE) as { createdAt?: number; entries?: Record<string, string> } | null;
  const entries: Record<string, string> = Object.create(null);
  if (savedPkce?.createdAt && Date.now() - savedPkce.createdAt < 600000 && savedPkce.createdAt <= Date.now()) {
    for (const [key, value] of Object.entries(savedPkce.entries ?? {})) {
      if (/^er-auth(?:-flow-[a-zA-Z0-9_-]{8,64}|-flows)?-code-verifier$/.test(key) && typeof value === 'string') entries[key] = value;
    }
  }
  const validKey = (key: string) => /^er-auth(?:-flow-[a-zA-Z0-9_-]{8,64}|-flows)?-code-verifier$/.test(key);
  return {
    session,
    saveSession(value: SessionTokens) {
      // Explicit allowlist: never persist Google provider tokens or cached user claims.
      write(SESSION, { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: value.expires_at }, 60 * 60 * 24 * 30);
    },
    clearSession: () => clear(SESSION),
    clearPkce: () => { for (const key of Object.keys(entries)) delete entries[key]; clear(PKCE); },
    storage: {
      isServer: true,
      // Session loading/refresh is explicit below; the SDK stores PKCE state only.
      getItem: (key: string) => validKey(key) ? entries[key] ?? null : null,
      setItem(key: string, value: string) {
        if (!validKey(key)) return;
        entries[key] = value;
        write(PKCE, { createdAt: Date.now(), entries }, 600);
      },
      removeItem(key: string) {
        if (!validKey(key)) return;
        delete entries[key];
        if (Object.keys(entries).length) write(PKCE, { createdAt: Date.now(), entries }, 600);
        else clear(PKCE);
      },
    },
  };
}
