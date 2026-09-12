import type { Pool } from 'pg';
import { RideOperationError } from './rideOperations';
import type { RideChat } from '../shared/messages';

// Share the ride-operation lock: membership checks and writes cannot race leave/cancel.
export async function rideChat(pool: Pool, rideId: string, userId: string, body?: string): Promise<RideChat> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ride = (await client.query('SELECT cancelled_at FROM rides WHERE id=$1 FOR UPDATE', [rideId])).rows[0];
    if (!ride) throw new RideOperationError(404, 'Ride not found.');
    const membership = await client.query('SELECT 1 FROM ride_participants WHERE ride_id=$1 AND user_id=$2 AND left_at IS NULL', [rideId, userId]);
    if (!membership.rowCount) throw new RideOperationError(403, 'Only current participants can access this chat.');
    if (body !== undefined) {
      if (ride.cancelled_at) throw new RideOperationError(409, 'This ride is cancelled. Chat is read-only.');
      await client.query('INSERT INTO messages(ride_id,sender_user_id,body) VALUES($1,$2,$3)', [rideId, userId, body]);
    }
    const result = await client.query(`SELECT m.id::text, m.ride_id AS "rideId", m.sender_user_id AS "senderUserId",
      u.full_name AS "senderName", m.body, m.created_at AS "createdAt"
      FROM messages m JOIN users u ON u.id=m.sender_user_id WHERE m.ride_id=$1 ORDER BY m.id`, [rideId]);
    await client.query('COMMIT');
    return { cancelledAt: ride.cancelled_at?.toISOString() ?? null,
      messages: result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
