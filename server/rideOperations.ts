import type { Pool } from 'pg';
import { getRide } from './rides';

export class RideOperationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function operateRide(pool: Pool, id: string, userId: string, operation: 'join' | 'leave' | 'cancel') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // All membership/cancellation writers take this same lock. Read capacity only
    // after acquiring it; a waiting join sees the previous transaction's commit.
    const locked = await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id]);
    const ride = locked.rows[0];
    if (!ride) throw new RideOperationError(404, 'Ride not found.');
    if (operation === 'cancel') {
      if (ride.host_user_id !== userId) throw new RideOperationError(403, 'Only the host can cancel this ride.');
      await client.query('UPDATE rides SET cancelled_at=COALESCE(cancelled_at, clock_timestamp()) WHERE id=$1', [id]);
    } else {
      if (ride.host_user_id === userId) throw new RideOperationError(409, operation === 'join' ? 'You already host this ride.' : 'Hosts must cancel the ride instead of leaving.');
      const membership = (await client.query('SELECT * FROM ride_participants WHERE ride_id=$1 AND user_id=$2', [id, userId])).rows[0];
      if (operation === 'leave') {
        if (!membership) throw new RideOperationError(409, 'You are not a participant in this ride.');
        // Retrying a completed leave is successful; cancellation preserves history.
        if (!membership.left_at) {
          if (ride.cancelled_at) throw new RideOperationError(409, 'This ride is cancelled.');
          await client.query('UPDATE ride_participants SET left_at=clock_timestamp() WHERE ride_id=$1 AND user_id=$2', [id, userId]);
        }
      } else {
        if (ride.cancelled_at) throw new RideOperationError(409, 'This ride is cancelled.');
        // Use wall time after the lock, not BEGIN time (a lock wait can cross departure).
        const timing = await client.query('SELECT departure_at > clock_timestamp() AS future FROM rides WHERE id=$1', [id]);
        if (!timing.rows[0].future) throw new RideOperationError(409, 'This ride has already departed.');
        if (membership && !membership.left_at) throw new RideOperationError(409, 'You already joined this ride.');
        const count = await client.query('SELECT count(*)::int AS occupied FROM ride_participants WHERE ride_id=$1 AND left_at IS NULL', [id]);
        if (count.rows[0].occupied >= ride.seats_total) throw new RideOperationError(409, 'This ride is full.');
        await client.query(`INSERT INTO ride_participants(ride_id,user_id) VALUES($1,$2)
          ON CONFLICT(ride_id,user_id) DO UPDATE SET left_at=NULL, joined_at=clock_timestamp()`, [id, userId]);
      }
    }
    const result = await getRide(client, id);
    await client.query('COMMIT');
    return result!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
