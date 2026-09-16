import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { PublicProfile, RatingInput, RideRatings } from '../shared/reputation';
import { RideOperationError } from './rideOperations';

type Database = Pool | PoolClient;
// Preserve upload-version invalidation without exposing any part of the provider URL.
export const publicAvatarPath = (id: string, storedUrl: string) =>
  `/api/users/${encodeURIComponent(id)}/avatar?v=${createHash('sha256').update(storedUrl).digest('hex').slice(0, 24)}`;

// Explicit allowlist: provider URLs can contain Supabase subjects, so expose a local image URL.
export async function publicProfiles(db: Database, ids: string[]): Promise<PublicProfile[]> {
  const result = await db.query(`SELECT u.id, COALESCE(u.display_name,u.full_name) AS name, u.avatar_url AS avatar,
    (SELECT count(*)::int FROM reputation_memberships p JOIN rides r ON r.id=p.ride_id
      WHERE p.user_id=u.id AND p.eligibility='joined' AND r.cancelled_at IS NULL AND r.departure_at <= clock_timestamp()) AS rides,
    count(a.ride_id)::int AS ratings, count(*) FILTER(WHERE a.outcome='reliable')::int AS reliable,
    count(DISTINCT a.ride_id)::int AS rated_rides, count(DISTINCT a.rater_user_id)::int AS raters
    FROM users u LEFT JOIN reliability_ratings a ON a.recipient_user_id=u.id
    WHERE u.id=ANY($1::text[]) GROUP BY u.id`, [ids]);
  return result.rows.map(row => ({ id: row.id, fullName: row.name, avatarUrl: row.avatar ? publicAvatarPath(row.id, row.avatar) : null,
    reputation: { rideCount: row.rides, ratingCount: row.ratings, reliableCount: row.reliable, issueCount: row.ratings-row.reliable,
      distinctRideCount: row.rated_rides, distinctRaterCount: row.raters,
      reliabilityPercent: row.ratings>=3 && row.rated_rides>=3 && row.raters>=3 ? Math.round(100*row.reliable/row.ratings) : null } }));
}

export async function rideRatings(db: Database, rideId: string, userId: string): Promise<RideRatings> {
  const result = await db.query(`SELECT r.cancelled_at, r.departure_at <= clock_timestamp() AS past,
    r.departure_at > clock_timestamp()-interval '7 days' AS within_window,
    mine.eligibility FROM rides r LEFT JOIN reputation_memberships mine ON mine.ride_id=r.id AND mine.user_id=$2 WHERE r.id=$1`, [rideId,userId]);
  const ride=result.rows[0];
  if(!ride) throw new RideOperationError(404,'Ride not found.');
  if(ride.eligibility!=='joined') throw new RideOperationError(403,'Only participants joined at departure can rate this ride.');
  if(ride.cancelled_at || !ride.past) return {canRate:false,recipients:[]};
  const rows=await db.query(`SELECT p.user_id,p.eligibility,a.outcome,a.reason FROM reputation_memberships p
    LEFT JOIN reliability_ratings a ON a.ride_id=p.ride_id AND a.recipient_user_id=p.user_id AND a.rater_user_id=$2
    WHERE p.ride_id=$1 AND p.user_id<>$2 AND p.eligibility IS NOT NULL ORDER BY p.user_id`,[rideId,userId]);
  const profiles=await publicProfiles(db,rows.rows.map(p=>p.user_id));
  return {canRate:ride.within_window,recipients:rows.rows.map(p=>({profile:profiles.find(u=>u.id===p.user_id)!,eligibility:p.eligibility,
    rating:p.outcome?{outcome:p.outcome,reason:p.reason}:null}))};
}

export async function submitRating(pool: Pool, rideId: string, userId: string, input: RatingInput) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Same lock as leave/cancel/join: persisted membership cannot change under this decision.
    const locked=await client.query('SELECT id FROM rides WHERE id=$1 FOR UPDATE',[rideId]);
    if(!locked.rowCount) throw new RideOperationError(404,'Ride not found.');
    if(userId===input.recipientUserId) throw new RideOperationError(400,'You cannot rate yourself.');
    const state=await rideRatings(client,rideId,userId);
    const recipient=state.recipients.find(p=>p.profile.id===input.recipientUserId);
    if(!recipient) throw new RideOperationError(403,'This participant is not eligible for a rating.');
    const reason=input.outcome==='issue'?input.reason:null;
    if(recipient.rating) {
      if(recipient.rating.outcome!==input.outcome || recipient.rating.reason!==reason) throw new RideOperationError(409,'This participant has already been rated. Ratings cannot be changed.');
    } else {
      if(!state.canRate) throw new RideOperationError(409,'Ratings are available for seven days after departure.');
      if(recipient.eligibility==='late_cancellation' ? reason!=='late_cancellation' : reason==='late_cancellation')
        throw new RideOperationError(400,'That outcome is not allowed for this participant.');
      await client.query('INSERT INTO reliability_ratings(ride_id,rater_user_id,recipient_user_id,outcome,reason) VALUES($1,$2,$3,$4,$5)',[rideId,userId,input.recipientUserId,input.outcome,reason]);
    }
    const response=await rideRatings(client,rideId,userId);
    await client.query('COMMIT');
    return response;
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
