import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { createPool } from '../db';
import { appOrigin, authProvider, AuthFailure } from './provider';
import { authCookies } from './cookies';
import { syncUser } from './users';

export const sameOrigin: RequestHandler = (req, _res, next) => {
  try {
    if (req.headers.origin !== appOrigin().origin) throw new AuthFailure(403, 'Cross-origin requests are not allowed.');
    next();
  } catch (error) { next(error); }
};
export const privateResponse: RequestHandler = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
export function authentication() {
  const pool = process.env.DATABASE_URL ? createPool() : null;
  const requireUser: RequestHandler = async (req, res, next) => {
    try {
      const identity = await authProvider(req, res).identity();
      if (!pool) throw new AuthFailure(503, 'User storage is not configured.');
      res.locals.user = await syncUser(pool, identity);
      next();
    } catch (error) { next(error); }
  };
  const router = Router();
  router.use(privateResponse);
  router.post('/login', sameOrigin, async (req, res) => { res.json({ url: await authProvider(req, res).login() }); });
  router.get('/callback', async (req, res) => {
    let provider: ReturnType<typeof authProvider> | undefined;
    try {
      if (typeof req.query.code !== 'string' || req.query.code.length > 2048) throw new AuthFailure(400, 'Invalid authentication callback.');
      provider = authProvider(req, res);
      const identity = await provider.callback(req.query.code, typeof req.query.sb_flow_id === 'string' ? req.query.sb_flow_id : undefined);
      if (!pool) throw new AuthFailure(503, 'User storage is not configured.');
      await syncUser(pool, identity);
      res.redirect('/#/profile');
    } catch (error) {
      provider?.clear();
      try { const cookies = authCookies(req, res, appOrigin().protocol === 'https:'); cookies.clearSession(); cookies.clearPkce(); } catch { /* Invalid configuration cannot establish a session. */ }
      // Only a fixed, non-sensitive error code reaches the browser redirect.
      const status = error instanceof AuthFailure ? error.status : 503;
      res.redirect(`/#/signin?error=${status}`);
    }
  });
  router.get('/me', requireUser, (_req, res) => res.json(res.locals.user));
  router.get('/profile', requireUser, (_req, res) => res.json(res.locals.user));
  router.post('/logout', sameOrigin, async (req, res) => {
    try { await authProvider(req, res).logout(); }
    finally { const cookies = authCookies(req, res, appOrigin().protocol === 'https:'); cookies.clearSession(); cookies.clearPkce(); }
    res.status(204).end();
  });
  return { router, requireUser };
}
export const authErrors: ErrorRequestHandler = (error, req, res, next) => {
  if (!(error instanceof AuthFailure)) {
    if (!req.originalUrl.startsWith('/api/auth/') || error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') return next(error);
    res.set('Cache-Control', 'private, no-store').status(503).json({ error: 'Authentication is temporarily unavailable. Please try again.' });
    return;
  }
  res.set('Cache-Control', 'private, no-store').status(error.status).json({ error: error.message });
};
