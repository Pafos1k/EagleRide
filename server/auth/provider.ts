import { createClient, type AuthError, type Session, type User } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { authCookies, type SessionTokens } from './cookies';

export class AuthFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function appOrigin() {
  const raw = process.env.APP_ORIGIN;
  if (!raw) throw new AuthFailure(503, 'Authentication is not configured.');
  const url = new URL(raw);
  if (url.origin !== raw || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new AuthFailure(503, 'Authentication origin is not configured correctly.');
  }
  return url;
}
export function bcIdentity(user: User) {
  const email = user.email ?? '';
  const parts = email.split('@');
  if (!user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at)) || parts.length !== 2
    || !parts[0] || /\s/.test(email) || parts[1].toLowerCase() !== 'bc.edu') {
    throw new AuthFailure(403, 'A verified @bc.edu email account is required.');
  }
  return { subject: user.id, email: email.toLowerCase(), verifiedAt: user.email_confirmed_at,
    fullName: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? parts[0]).trim().slice(0, 200) || parts[0] };
}
export function authProvider(req: Request, res: Response) {
  const origin = appOrigin();
  const cookies = authCookies(req, res, origin.protocol === 'https:');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AuthFailure(503, 'Authentication is not configured.');
  let providerUrl: URL;
  try { providerUrl = new URL(url); } catch { throw new AuthFailure(503, 'Authentication URL is not configured correctly.'); }
  if (providerUrl.protocol !== 'https:' && !(providerUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(providerUrl.hostname))) {
    throw new AuthFailure(503, 'Authentication requires a secure provider URL.');
  }
  const client = createClient(url, key, { auth: {
    flowType: 'pkce', storageKey: 'er-auth', storage: cookies.storage,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
  }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  function failure(error: AuthError | null): never {
    if (error && (error.status === 0 || error.status === 429 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) {
      throw new AuthFailure(503, 'Authentication service is temporarily unavailable.');
    }
    cookies.clearSession();
    throw new AuthFailure(401, 'Please sign in again.');
  }
  async function verify(tokens: SessionTokens) {
    const { data, error } = await client.auth.getUser(tokens.access_token);
    if (error || !data.user) failure(error);
    try { return bcIdentity(data.user); }
    catch (error) { cookies.clearSession(); throw error; }
  }
  async function tokens() {
    let current = cookies.session();
    if (!current) throw new AuthFailure(401, 'Please sign in.');
    if (current.expires_at <= Math.floor(Date.now() / 1000) + 30) {
      const { data, error } = await client.auth.refreshSession({ refresh_token: current.refresh_token });
      if (error || !data.session) failure(error);
      current = sessionTokens(data.session);
      cookies.saveSession(current);
    }
    return current;
  }
  function sessionTokens(session: Session): SessionTokens {
    return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at! };
  }
  return {
    clear() { cookies.clearSession(); cookies.clearPkce(); },
    async login() {
      cookies.clearPkce();
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: `${origin.origin}/api/auth/callback`, skipBrowserRedirect: true,
      } });
      if (error || !data.url) failure(error);
      return data.url;
    },
    async callback(code: string, flowId?: string) {
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        if (error || !data.session) failure(error);
        const next = sessionTokens(data.session);
        const identity = await verify(next);
        cookies.saveSession(next);
        return identity;
      } finally { cookies.clearPkce(); }
    },
    identity: async () => verify(await tokens()),
    async logout() {
      try {
        if (!cookies.session()) return;
        const current = await tokens();
        // This is Supabase's user-JWT logout endpoint, not Google token revocation.
        // The publishable key and current user's JWT are sufficient; no service role.
        const { error } = await client.auth.admin.signOut(current.access_token, 'local');
        if (error) failure(error);
      } finally { cookies.clearSession(); cookies.clearPkce(); }
    },
  };
}
