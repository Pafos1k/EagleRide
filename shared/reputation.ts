import { z } from 'zod';

export const ratingInput = z.discriminatedUnion('outcome', [
  z.object({ recipientUserId: z.string().min(1).max(200), outcome: z.literal('reliable') }).strict(),
  z.object({ recipientUserId: z.string().min(1).max(200), outcome: z.literal('issue'), reason: z.enum(['no_show', 'significantly_late', 'late_cancellation']) }).strict(),
]);
export type RatingInput = z.infer<typeof ratingInput>;
export interface Reputation {
  reliableCount: number; issueCount: number; ratingCount: number;
  distinctRideCount: number; distinctRaterCount: number; rideCount: number;
  reliabilityPercent: number | null;
}
export interface PublicProfile { id: string; fullName: string; avatarUrl: string | null; reputation: Reputation }
export interface RatingRecipient {
  profile: PublicProfile; eligibility: 'joined' | 'late_cancellation';
  rating: { outcome: 'reliable' | 'issue'; reason: string | null } | null;
}
export interface RideRatings { canRate: boolean; recipients: RatingRecipient[] }
