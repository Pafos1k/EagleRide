import type { Pool, PoolClient } from 'pg';
import { rideCategory, type ActivityRide, type CreateRideInput, type PersistedRide } from '../shared/rides';

const selectRides = `SELECT r.*, COALESCE((
  SELECT json_agg(json_build_object('id', p.id, 'rideId', p.ride_id,
    'userId', p.user_id, 'joinedAt', p.joined_at, 'leftAt', p.left_at) ORDER BY p.joined_at, p.id)
  FROM ride_participants p WHERE p.ride_id = r.id
), '[]'::json) AS participants FROM rides r`;
function toRide(row: Record<string, any>): PersistedRide {
  return {
    id: row.id, hostUserId: row.host_user_id,
    origin: { name: row.origin_name, address: row.origin_address, terminal: row.origin_terminal },
    destination: { name: row.destination_name, address: row.destination_address, terminal: row.destination_terminal },
    departureTime: row.departure_at.toISOString(), seatsTotal: row.seats_total,
    seatsTaken: row.participants.filter((p: { leftAt: string | null }) => !p.leftAt).length, luggageType: row.luggage_type, flexibility: row.flexibility,
    estimatedTotalCostCents: row.estimated_total_cost_cents, hostNote: row.host_note,
    cancelledAt: row.cancelled_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(), participants: row.participants,
  };
}
export async function listRides(pool: Pool): Promise<PersistedRide[]> {
  const result = await pool.query(`${selectRides} ORDER BY r.departure_at, r.id`);
  return result.rows.map(toRide);
}
export async function getRide(db: Pool | PoolClient, id: string): Promise<PersistedRide | null> {
  const result = await db.query(`${selectRides} WHERE r.id = $1`, [id]);
  return result.rows[0] ? toRide(result.rows[0]) : null;
}
export async function createRide(pool: Pool, input: CreateRideInput, actingUserId: string): Promise<PersistedRide> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO rides (host_user_id,
      origin_name, origin_address, origin_terminal, destination_name, destination_address, destination_terminal,
      departure_at, seats_total, luggage_type, flexibility, estimated_total_cost_cents, host_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [
      actingUserId, input.origin.name, input.origin.address, input.origin.terminal,
      input.destination.name, input.destination.address, input.destination.terminal,
      input.departureTime, input.seatsTotal, input.luggageType, input.flexibility,
      input.estimatedTotalCostCents, input.hostNote,
    ]);
    const id = result.rows[0].id;
    await client.query('INSERT INTO ride_participants (ride_id, user_id) VALUES ($1, $2)', [id, actingUserId]);
    const ride = await getRide(client, id);
    await client.query('COMMIT');
    return ride!;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function userRides(pool: Pool, userId: string): Promise<ActivityRide[]> {
  const result = await pool.query(`${selectRides} WHERE r.host_user_id=$1 OR EXISTS (
    SELECT 1 FROM ride_participants mine WHERE mine.ride_id=r.id AND mine.user_id=$1 AND mine.left_at IS NULL
  ) ORDER BY r.departure_at,r.id`, [userId]);
  const now = Date.now();
  return result.rows.map(row => {
    const ride = toRide(row);
    return { ...ride, category: rideCategory(ride, now), role: ride.hostUserId === userId ? 'host' : 'participant',
      membership: ride.participants.some(p => p.userId === userId && !p.leftAt) ? 'active' : 'left' };
  });
}
