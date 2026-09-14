CREATE TABLE ride_route_snapshots (
  ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  route_data jsonb,
  estimated_fare_cents integer CHECK (estimated_fare_cents BETWEEN 0 AND 1000000),
  last_attempt_at timestamptz NOT NULL,
  milestone smallint NOT NULL CHECK (milestone BETWEEN 0 AND 3),
  latest_refresh_failed boolean NOT NULL DEFAULT false
);
