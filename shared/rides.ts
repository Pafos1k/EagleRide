import type { z } from 'zod';
import type { locationSchema, createRideSchema } from './rideInput';

export type RideLocation = z.infer<typeof locationSchema>;
export type CreateRideInput = z.infer<typeof createRideSchema>;
export interface PersistedRide extends CreateRideInput {
  id: string;
  hostUserId: string;
  seatsTaken: number;
  createdAt: string;
  participants: { id: string; rideId: string; userId: string; joinedAt: string }[];
}
export const locationLabel = (location: RideLocation) =>
  `${location.name}${location.terminal ? ` (${location.terminal})` : ''}`;
