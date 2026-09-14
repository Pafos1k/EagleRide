import type { Pool } from 'pg';
import type { RouteInput, RouteResult, RouteSnapshot } from '../shared/routing';
import { estimateRouteFare } from '../src/utils/priceEstimator';
import { RideOperationError } from './rideOperations';

export function refreshMilestone(remainingMs: number) {
  return remainingMs <= 3600000 ? 3 : remainingMs <= 7200000 ? 2 : remainingMs <= 21600000 ? 1 : 0;
}
export async function rideRouteSnapshot(pool: Pool, id: string, lookup: (input: RouteInput) => Promise<RouteResult>, clock?: () => number): Promise<RouteSnapshot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Coordinate all viewers/processes and cancellation with the existing ride lock.
    const ride = (await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!ride) throw new RideOperationError(404, 'Ride not found.');
    const now = clock ? clock() : (await client.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
    let saved = (await client.query('SELECT * FROM ride_route_snapshots WHERE ride_id=$1', [id])).rows[0];
    const remaining = ride.departure_at.getTime() - now, milestone = refreshMilestone(remaining);
    const due = !ride.cancelled_at && remaining > 0 && (!saved || milestone > saved.milestone ||
      (milestone === 3 && now - saved.last_attempt_at.getTime() >= 20 * 60000));
    if (due) {
      let data = saved?.route_data ?? null, fare = saved?.estimated_fare_cents ?? null, failed = false;
      try {
        const result = await lookup({
          origin: { name: ride.origin_name, address: ride.origin_address, terminal: ride.origin_terminal },
          destination: { name: ride.destination_name, address: ride.destination_address, terminal: ride.destination_terminal },
          departureTime: ride.departure_at.toISOString(),
        });
        // Freeze fare from the first successful route; ETA updates do not reprice.
        if (!data) fare = estimateRouteFare(result);
        data = result;
      } catch { failed = true; }
      saved = (await client.query(`INSERT INTO ride_route_snapshots(ride_id,route_data,estimated_fare_cents,last_attempt_at,milestone,latest_refresh_failed)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(ride_id) DO UPDATE SET
        route_data=EXCLUDED.route_data, estimated_fare_cents=EXCLUDED.estimated_fare_cents,
        last_attempt_at=EXCLUDED.last_attempt_at, milestone=EXCLUDED.milestone,
        latest_refresh_failed=EXCLUDED.latest_refresh_failed RETURNING *`,
        [id, data, fare, new Date(now), milestone, failed])).rows[0];
    }
    await client.query('COMMIT');
    return { data: saved?.route_data ?? null, estimatedFareCents: saved?.estimated_fare_cents ?? null,
      lastAttemptAt: saved?.last_attempt_at.toISOString() ?? null, latestRefreshFailed: saved?.latest_refresh_failed ?? false };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
