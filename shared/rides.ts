import type { z } from 'zod';
import type { locationSchema, createRideSchema } from './rideInput';

export type RideLocation = z.infer<typeof locationSchema>;
export type CreateRideInput = z.infer<typeof createRideSchema>;
export interface PersistedRide extends CreateRideInput {
  id: string;
  hostUserId: string;
  seatsTaken: number;
  createdAt: string;
  cancelledAt: string | null;
  participants: { id: string; rideId: string; userId: string; joinedAt: string; leftAt: string | null }[];
}
export const locationLabel = (location: RideLocation) =>
  `${location.name}${location.terminal ? ` (${location.terminal})` : ''}`;

export type RideCategory = 'upcoming' | 'past' | 'cancelled';
export const rideCategory = (ride: PersistedRide, now = Date.now()): RideCategory =>
  ride.cancelledAt ? 'cancelled' : Date.parse(ride.departureTime) <= now ? 'past' : 'upcoming';
export type ActivityRide = PersistedRide & { role: 'host' | 'participant'; membership: 'active' | 'left'; category: RideCategory };
