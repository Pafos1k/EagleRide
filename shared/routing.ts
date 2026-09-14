import { z } from 'zod';
import { locationSchema } from './rideInput';
export const routeInputSchema = z.object({
  origin: locationSchema, destination: locationSchema,
  departureTime: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type RouteInput = z.infer<typeof routeInputSchema>;
export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  trafficAwareDurationSeconds: number | null;
  source: 'google-routes';
  calculatedAt: string;
  departureTime: string;
  timing: 'current' | 'scheduled';
}

export interface RouteSnapshot {
  data: RouteResult | null;
  estimatedFareCents: number | null;
  lastAttemptAt: string | null;
  latestRefreshFailed: boolean;
}
