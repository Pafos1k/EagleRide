import { sameOrigin, privateResponse } from './auth/routes';
import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { operateRide, RideOperationError } from './rideOperations';
import { z } from 'zod';
import { createRideSchema } from '../shared/rideInput';
import { createPool } from './db';
import { createRide, getRide, listRides, userRides } from './rides';

export function rideRoutes(requireUser: RequestHandler) {
  const router = Router();
  // Keep Stage 1 health and Gemini fallbacks usable without database configuration.
  const pool = process.env.DATABASE_URL ? createPool() : null;
  router.use((_req, res, next) => {
    if (!pool) return res.status(503).json({ error: 'Ride storage is not configured.' });
    next();
  });
  router.get('/', async (_req, res) => res.json(await listRides(pool!)));
  router.get('/mine', privateResponse, requireUser, async (_req, res) => res.json(await userRides(pool!, res.locals.user.id)));
  router.get('/:id', async (req, res) => {
    if (typeof req.params.id !== 'string' || !z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
    const ride = await getRide(pool!, req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found.' });
    res.json(ride);
  });
  router.post('/', privateResponse, sameOrigin, requireUser, async (req, res) => {
    const input = createRideSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Invalid ride input.', issues: input.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    const ride = await createRide(pool!, input.data, res.locals.user.id);
    res.status(201).location(`/api/rides/${ride.id}`).json(ride);
  });


  for (const operation of ['join', 'leave', 'cancel'] as const) {
    router.post('/:id/' + operation, privateResponse, sameOrigin, requireUser, async (req, res) => {
      if (typeof req.params.id !== 'string' || !z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
      if (req.body !== undefined && !z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ error: 'This operation accepts no identity or ride fields.' });
      res.json(await operateRide(pool!, req.params.id, res.locals.user.id, operation));
    });
  }
  return router;
}

export const rideErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof RideOperationError) return res.status(error.status).json({ error: error.message });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  console.error('Ride database operation failed.');
  res.status(503).json({ error: 'Ride storage is temporarily unavailable. Please try again.' });
};
