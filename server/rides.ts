import type { Pool, PoolClient } from 'pg';
import type { CreateRideInput, PersistedRide } from '../shared/rides';

// Deliberately fixed until a later authentication stage. Never read from requests.
const ACTING_USER_ID = 'u1';
const selectRides = `SELECT r.*, COALESCE((
  SELECT json_agg(json_build_object('id', p.id, 'rideId', p.ride_id,
    'userId', p.user_id, 'joinedAt', p.joined_at) ORDER BY p.joined_at, p.id)
  FROM ride_participants p WHERE p.ride_id = r.id
), '[]'::json) AS participants FROM rides r`;
function toRide(row: Record<string, any>): PersistedRide {
  return {
    id: row.id, hostUserId: row.host_user_id,
    origin: { name: row.origin_name, address: row.origin_address, terminal: row.origin_terminal },
    destination: { name: row.destination_name, address: row.destination_address, terminal: row.destination_terminal },
    departureTime: row.departure_at.toISOString(), seatsTotal: row.seats_total,
    seatsTaken: row.participants.length, luggageType: row.luggage_type, flexibility: row.flexibility,
    estimatedTotalCostCents: row.estimated_total_cost_cents, hostNote: row.host_note,
    createdAt: row.created_at.toISOString(), participants: row.participants,
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
export async function createRide(pool: Pool, input: CreateRideInput): Promise<PersistedRide> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO rides (host_user_id,
      origin_name, origin_address, origin_terminal, destination_name, destination_address, destination_terminal,
      departure_at, seats_total, luggage_type, flexibility, estimated_total_cost_cents, host_note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [
      ACTING_USER_ID, input.origin.name, input.origin.address, input.origin.terminal,
      input.destination.name, input.destination.address, input.destination.terminal,
      input.departureTime, input.seatsTotal, input.luggageType, input.flexibility,
      input.estimatedTotalCostCents, input.hostNote,
    ]);
    const id = result.rows[0].id;
    await client.query('INSERT INTO ride_participants (ride_id, user_id) VALUES ($1, $2)', [id, ACTING_USER_ID]);
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
