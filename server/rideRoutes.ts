import { ratingInput } from '../shared/reputation';
import { rideRatings, submitRating } from './reputation';
import {chatEvents,rideEvents} from './chatEvents';
import {rideSearchSchema} from '../shared/rideSearch';
import { createRoutingService, routingQuota } from './routing';
import { rideRouteSnapshot } from './routeSnapshots';
import { rideChat } from './messages';
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
  const lookup = createRoutingService({ key: process.env.GOOGLE_MAPS_ROUTES_API_KEY });
  const quota = routingQuota();
  router.post('/:id/route-snapshot', privateResponse, sameOrigin, async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
    if (req.body !== undefined && !z.object({}).strict().safeParse(req.body).success) return res.status(400).json({ error: 'Route snapshots accept no location or refresh overrides.' });
    res.json(await rideRouteSnapshot(pool!, String(req.params.id), async input => {
      // Limit new provider attempts, not access to already stored snapshots.
      if (quota(req.ip ?? req.socket.remoteAddress ?? 'unknown')) throw new Error('Routing limit reached');
      return lookup(input);
    }));
  });
  router.get('/', async (req, res) => { const search=rideSearchSchema.safeParse(req.query); if(!search.success)return res.status(400).json({error:'Invalid ride search.'}); res.json(await listRides(pool!,search.data)); });
  router.get('/mine', privateResponse, requireUser, async (_req, res) => res.json(await userRides(pool!, res.locals.user.id)));
  router.get('/:id/ratings',privateResponse,requireUser,async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success)return res.status(404).json({error:'Ride not found.'});
    res.json(await rideRatings(pool!,String(req.params.id),res.locals.user.id));
  });
  router.post('/:id/ratings',privateResponse,sameOrigin,requireUser,async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success)return res.status(404).json({error:'Ride not found.'});
    const input=ratingInput.safeParse(req.body);
    if(!input.success)return res.status(400).json({error:'Invalid rating.'});
    res.json(await submitRating(pool!,String(req.params.id),res.locals.user.id,input.data));
  });
  // Ride details are public. This stream exposes no chat activity or identities.
  router.get('/:id/ride-events',privateResponse,async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success)return res.status(404).end();
    await rideEvents(pool!,req,res,String(req.params.id));
  });
  router.get('/:id/events',privateResponse,requireUser,async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success)return res.status(404).end();
    await chatEvents(pool!,req,res,res.locals.user.id,String(req.params.id));
  });
  for(const method of ['put','delete'] as const){
    router[method]('/:id/messages/:messageId/reactions',privateResponse,sameOrigin,requireUser,async(req,res)=>{
      const body=z.object({emoji:z.enum(['👍','❤️','😂','🎉','👀','😮','😢'])}).strict().safeParse(req.body);
      if(!body.success || !z.uuid().safeParse(req.params.id).success || !/^[1-9][0-9]{0,17}$/.test(String(req.params.messageId)))return res.status(400).json({error:'Invalid reaction.'});
      res.json(await rideChat(pool!,String(req.params.id),res.locals.user.id,undefined,undefined,{id:String(req.params.messageId),emoji:body.data.emoji,remove:method==='delete'}));
    });
  }
  router.delete('/:id/messages/:messageId',privateResponse,sameOrigin,requireUser,async(req,res)=>{
    if(!z.uuid().safeParse(req.params.id).success || !/^[1-9][0-9]{0,17}$/.test(String(req.params.messageId)))return res.status(400).json({error:'Invalid message.'});
    res.json(await rideChat(pool!,String(req.params.id),res.locals.user.id,undefined,undefined,{id:String(req.params.messageId)}));
  });
  router.get('/:id/messages', privateResponse, requireUser, async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
    res.json(await rideChat(pool!, String(req.params.id), res.locals.user.id));
  });
  router.post('/:id/messages', privateResponse, sameOrigin, requireUser, async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Ride not found.' });
    const input = z.object({ body: z.string().trim().min(1).max(2000), clientMessageId:z.uuid().optional() }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Message must contain 1–2000 characters and no other fields.' });
    res.status(201).json(await rideChat(pool!, String(req.params.id), res.locals.user.id, input.data.body,input.data.clientMessageId));
  });
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
