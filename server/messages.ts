import type { Pool } from 'pg';
import { RideOperationError } from './rideOperations';
import type { RideChat } from '../shared/messages';

// Share the ride-operation lock: membership checks and writes cannot race leave/cancel.
export async function rideChat(pool: Pool, rideId: string, userId: string, body?: string, clientMessageId?: string, action?: {id:string;emoji?:string;remove?:boolean}): Promise<RideChat> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ride = (await client.query('SELECT cancelled_at FROM rides WHERE id=$1 FOR UPDATE', [rideId])).rows[0];
    if (!ride) throw new RideOperationError(404, 'Ride not found.');
    const membership = await client.query('SELECT 1 FROM ride_participants WHERE ride_id=$1 AND user_id=$2 AND left_at IS NULL', [rideId, userId]);
    if (!membership.rowCount) throw new RideOperationError(403, 'Only current participants can access this chat.');
    if(action){
      if(ride.cancelled_at)throw new RideOperationError(409,'This ride is cancelled. Chat is read-only.');
      const message=(await client.query('SELECT sender_user_id FROM messages WHERE ride_id=$1 AND id=$2',[rideId,action.id])).rows[0];
      if(!message)throw new RideOperationError(404,'Message not found.');
      if(action.emoji){
        if(ride.cancelled_at)throw new RideOperationError(409,'This ride is cancelled. Chat is read-only.');
        if(action.remove)await client.query('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3',[action.id,userId,action.emoji]);
        else await client.query('INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[action.id,userId,action.emoji]);
      }else{
        if(message.sender_user_id!==userId)throw new RideOperationError(403,'You can delete only your own messages.');
        await client.query('DELETE FROM messages WHERE id=$1',[action.id]);
      }
    }
    if (body !== undefined) {
      if (ride.cancelled_at) throw new RideOperationError(409, 'This ride is cancelled. Chat is read-only.');
      await client.query('INSERT INTO messages(ride_id,sender_user_id,body,client_message_id) VALUES($1,$2,$3,$4) ON CONFLICT (sender_user_id,client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING', [rideId, userId, body,clientMessageId ?? null]);
    }
    const result = await client.query(`SELECT m.id::text, m.ride_id AS "rideId", m.sender_user_id AS "senderUserId",
      COALESCE(u.display_name,u.full_name) AS "senderName", u.avatar_url AS "senderAvatarUrl", m.body, m.created_at AS "createdAt", COALESCE((SELECT json_agg(json_build_object('userId',r.user_id,'emoji',r.emoji) ORDER BY r.emoji,r.user_id) FROM message_reactions r WHERE r.message_id=m.id),'[]'::json) AS reactions
      FROM messages m JOIN users u ON u.id=m.sender_user_id WHERE m.ride_id=$1 ORDER BY m.id`, [rideId]);
    const revision=(await client.query('SELECT chat_revision::text FROM rides WHERE id=$1',[rideId])).rows[0].chat_revision;
    await client.query('COMMIT');
    return { revision, cancelledAt: ride.cancelled_at?.toISOString() ?? null,
      messages: result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
