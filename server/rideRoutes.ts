import { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { createRideSchema } from '../shared/rideInput';
import { createPool } from './db';
import { createRide, getRide, listRides } from './rides';

export function rideRoutes() {
  const router = Router();
  // Keep Stage 1 health and Gemini fallbacks usable without database configuration.
  const pool = process.env.DATABASE_URL ? createPool() : null;
  router.use((_req, res, next) => {
    if (!pool) return res.status(503).json({ error: 'Ride storage is not configured.' });
    next();
  });
  router.get('/', async (_req, res) => res.json(await listRides(pool!)));
  router.get('/:id', async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
    const ride = await getRide(pool!, req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found.' });
    res.json(ride);
  });
  router.post('/', async (req, res) => {
    const input = createRideSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Invalid ride input.', issues: input.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    const ride = await createRide(pool!, input.data);
    res.status(201).location(`/api/rides/${ride.id}`).json(ride);
  });

  return router;
}

export const rideErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  console.error('Ride database operation failed.');
  res.status(503).json({ error: 'Ride storage is temporarily unavailable. Please try again.' });
};
