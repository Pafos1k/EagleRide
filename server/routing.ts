import type { RequestHandler } from 'express';
import { type RouteInput, type RouteResult } from '../shared/routing';

const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MASK = 'routes.distanceMeters,routes.duration,routes.staticDuration,fallbackInfo';
const KNOWN: Record<string, string> = {
  'Boston College': '140 Commonwealth Ave, Chestnut Hill, MA',
  'Newton Campus': '885 Centre St, Newton, MA',
  'Logan Airport (BOS)': 'Logan International Airport, Boston, MA',
  'South Station': '700 Atlantic Ave, Boston, MA',
  '177 Huntington Ave': '177 Huntington Ave, Boston, MA',
};
class RoutingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function routeAddress(location: RouteInput['origin']): string {
  const address = location.address || KNOWN[location.name];
  if (!address) throw new RoutingError(422, 'Route unavailable: a complete address or supported location is required.');
  // Preserve explicit addresses, location names and terminal choice; never use category heuristics.
  return [location.name, location.terminal ? 'Terminal ' + location.terminal : '', address].filter(Boolean).join(', ');
}
function seconds(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,9})?s$/.test(value)) throw new Error('Invalid provider duration');
  const result = Number(value.slice(0, -1));
  if (!Number.isFinite(result) || result < 0) throw new Error('Invalid provider duration');
  return result;
}
export function createRoutingService(options: { key?: string; fetcher?: typeof fetch; timeoutMs?: number; now?: () => number } = {}) {
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: RouteResult }>();
  const pending = new Map<string, Promise<RouteResult>>();
  return async (input: RouteInput): Promise<RouteResult> => {
    if (!options.key) throw new RoutingError(503, 'Route information is unavailable.');
    const origin = routeAddress(input.origin), destination = routeAddress(input.destination);
    const timestamp = now();
    if (input.departureTime && (!Number.isFinite(Date.parse(input.departureTime)) ||
        Date.parse(input.departureTime) < timestamp || Date.parse(input.departureTime) > timestamp + 30 * 86400000)) {
      throw new RoutingError(422, 'Route unavailable for this departure time.');
    }
    const key = JSON.stringify([origin, destination, input.departureTime ?? null]);
    for (const [key, entry] of cache) if (entry.expires <= timestamp) cache.delete(key);
    const cached = cache.get(key);
    if (cached) return cached.value;
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
      try {
        const departureTime = input.departureTime ?? new Date(timestamp).toISOString();
        const response = await fetcher(GOOGLE_URL, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': options.key!, 'X-Goog-FieldMask': MASK },
          body: JSON.stringify({ origin: { address: origin }, destination: { address: destination },
            travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: false,
            // Omission means depart now at Google; a local timestamp can expire in transit.
            ...(input.departureTime ? { departureTime: input.departureTime } : {}) }),
        });
        if (!response.ok) throw new Error('Provider unavailable');
        const data = await response.json(), route = data.routes?.[0];
        if (!route || !Number.isSafeInteger(route.distanceMeters) || route.distanceMeters < 0) throw new Error('No route');
        const duration = seconds(route.duration);
        const baseline = seconds(route.staticDuration);
        // A fallback may have changed traffic computation. Do not label it traffic-aware.
        const result: RouteResult = { distanceMeters: route.distanceMeters, durationSeconds: baseline,
          trafficAwareDurationSeconds: data.fallbackInfo ? null : duration, source: 'google-routes',
          calculatedAt: new Date(now()).toISOString(), departureTime, timing: input.departureTime ? 'scheduled' : 'current' };
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, { value: result, expires: now() + 60000 });
        return result;
      } catch {
        // Never forward Google's response, request headers, key or raw exceptions.
        throw new RoutingError(503, 'Route information is unavailable. Open Google Maps to check the route.');
      } finally { clearTimeout(timer); }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
export function routingQuota(limit = 20) {
  const clients = new Map<string, { count: number; expires: number }>();
  return (ip: string): number => {
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.expires <= now) clients.delete(key);
    if (!clients.has(ip) && clients.size >= 1000) return 60;
    const entry = clients.get(ip) ?? { count: 0, expires: now + 60000 };
    clients.set(ip, entry);
    return ++entry.count > limit ? Math.ceil((entry.expires - now) / 1000) : 0;
  };
}
export function routingLimit(limit = 20): RequestHandler {
  const quota = routingQuota(limit);
  return (req, res, next) => {
    const retry = quota(req.ip ?? req.socket.remoteAddress ?? 'unknown');
    if (retry) return res.set('Retry-After', String(retry)).status(429).json({ error: 'Too many routing requests. Please try later.' });
    next();
  };
}
