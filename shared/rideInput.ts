import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const locationSchema = z.object({
  name: text(200),
  address: text(500).nullable().default(null),
  terminal: z.enum(['A', 'B', 'C', 'E']).nullable().default(null),
}).strict();
export const createRideSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  departureTime: z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Invalid departure time'),
  seatsTotal: z.number().int().min(1).max(4),
  luggageType: z.enum(['CARRY_ON_ONLY', 'ONE_SUITCASE', 'MULTIPLE']),
  flexibility: z.enum(['EXACT', 'PLUS_MINUS_30', 'PLUS_MINUS_60']),
  estimatedTotalCostCents: z.number().int().min(0).max(1000000),
  hostNote: text(2000).nullable().default(null),
}).strict();
